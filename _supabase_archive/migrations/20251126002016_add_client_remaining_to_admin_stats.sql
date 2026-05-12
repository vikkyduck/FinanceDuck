-- Add total_client_remaining to get_admin_stats function
-- Drop and recreate function, then regrant privileges
DROP FUNCTION IF EXISTS public.get_admin_stats(uuid);

CREATE OR REPLACE FUNCTION get_admin_stats(_token_id uuid)
RETURNS TABLE(
  current_month_revenue numeric,
  current_month_profit numeric,
  current_month_admin_share numeric,
  current_month_cat_share numeric,
  current_month_invoices_count integer,
  previous_month_revenue numeric,
  previous_month_profit numeric,
  revenue_trend numeric,
  profit_trend numeric,
  expected_revenue_3months numeric,
  total_client_remaining numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_curr_month_start date;
  v_prev_month_start date;
  v_prev_month_end date;
  v_future_date date;
BEGIN
  -- Устанавливаем контекст сессии
  PERFORM set_session_context(_token_id);
  
  -- Проверяем права админа
  IF NOT is_admin(_token_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Вычисляем даты
  v_curr_month_start := date_trunc('month', CURRENT_DATE);
  v_prev_month_start := date_trunc('month', CURRENT_DATE - interval '1 month');
  v_prev_month_end := v_curr_month_start - interval '1 day';
  v_future_date := CURRENT_DATE + interval '3 months';
  
  RETURN QUERY
  WITH current_month AS (
    SELECT 
      COALESCE(SUM(ic.client_bill), 0) as revenue,
      COALESCE(SUM(ic.net_profit_admin), 0) as profit,
      COALESCE(SUM(ic.admin_share_50), 0) as admin_share,
      COALESCE(SUM(ic.cat_share_50), 0) as cat_share,
      COUNT(*)::integer as invoice_count
    FROM invoices i
    INNER JOIN invoice_calculations ic ON ic.invoice_id = i.id
    WHERE i.status = 'paid'
      AND i.actual_payment_date IS NOT NULL
      AND i.actual_payment_date >= v_curr_month_start
  ),
  previous_month AS (
    SELECT 
      COALESCE(SUM(ic.client_bill), 0) as revenue,
      COALESCE(SUM(ic.net_profit_admin), 0) as profit
    FROM invoices i
    INNER JOIN invoice_calculations ic ON ic.invoice_id = i.id
    WHERE i.status = 'paid'
      AND i.actual_payment_date IS NOT NULL
      AND i.actual_payment_date >= v_prev_month_start
      AND i.actual_payment_date <= v_prev_month_end
  ),
  expected AS (
    SELECT COALESCE(SUM(ic.client_bill), 0) as expected_revenue
    FROM invoices i
    INNER JOIN invoice_calculations ic ON ic.invoice_id = i.id
    WHERE i.status = 'sent'
      AND i.actual_payment_date IS NULL
      AND i.payment_date IS NOT NULL
      AND i.payment_date >= CURRENT_DATE
      AND i.payment_date <= v_future_date
  ),
  client_remaining AS (
    SELECT COALESCE(SUM(ic.client_remaining), 0) as total_remaining
    FROM invoices i
    INNER JOIN invoice_calculations ic ON ic.invoice_id = i.id
    WHERE i.status = 'paid'
  )
  SELECT 
    cm.revenue,
    cm.profit,
    cm.admin_share,
    cm.cat_share,
    cm.invoice_count,
    pm.revenue,
    pm.profit,
    CASE WHEN pm.revenue > 0 THEN ((cm.revenue - pm.revenue) / pm.revenue) * 100 ELSE 0 END,
    CASE WHEN pm.profit > 0 THEN ((cm.profit - pm.profit) / pm.profit) * 100 ELSE 0 END,
    e.expected_revenue,
    cr.total_remaining
  FROM current_month cm, previous_month pm, expected e, client_remaining cr;
END;
$$;

-- Grant execute privilege to authenticated users
GRANT EXECUTE ON FUNCTION public.get_admin_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_stats(uuid) TO service_role;
