-- RPC функция для основных админских статистик (текущий месяц)
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
  expected_revenue_3months numeric
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
    e.expected_revenue
  FROM current_month cm, previous_month pm, expected e;
END;
$$;

-- RPC функция для помесячных данных
CREATE OR REPLACE FUNCTION get_admin_monthly_data(_token_id uuid, _year integer)
RETURNS TABLE(
  month_number integer,
  month_name text,
  total_sales numeric,
  invoice_count integer,
  total_profit numeric,
  cumulative_profit numeric,
  admin_share numeric,
  cat_share numeric,
  expenses numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_running_profit numeric := 0;
BEGIN
  PERFORM set_session_context(_token_id);
  
  IF NOT is_admin(_token_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  WITH monthly_data AS (
    SELECT 
      EXTRACT(MONTH FROM i.actual_payment_date)::integer as m_num,
      COALESCE(SUM(ic.client_bill), 0) as sales,
      COUNT(*)::integer as inv_count,
      COALESCE(SUM(ic.net_profit_admin), 0) as profit,
      COALESCE(SUM(ic.admin_share_50), 0) as a_share,
      COALESCE(SUM(ic.cat_share_50), 0) as c_share,
      COALESCE(SUM(ic.executor_expenses_total), 0) as exp
    FROM invoices i
    INNER JOIN invoice_calculations ic ON ic.invoice_id = i.id
    WHERE i.status = 'paid'
      AND i.actual_payment_date IS NOT NULL
      AND EXTRACT(YEAR FROM i.actual_payment_date) = _year
    GROUP BY EXTRACT(MONTH FROM i.actual_payment_date)
  ),
  months AS (
    SELECT generate_series(1, 12) as m_num
  )
  SELECT 
    m.m_num,
    CASE m.m_num
      WHEN 1 THEN 'Янв' WHEN 2 THEN 'Фев' WHEN 3 THEN 'Мар'
      WHEN 4 THEN 'Апр' WHEN 5 THEN 'Май' WHEN 6 THEN 'Июн'
      WHEN 7 THEN 'Июл' WHEN 8 THEN 'Авг' WHEN 9 THEN 'Сен'
      WHEN 10 THEN 'Окт' WHEN 11 THEN 'Ноя' WHEN 12 THEN 'Дек'
    END,
    COALESCE(md.sales, 0),
    COALESCE(md.inv_count, 0),
    COALESCE(md.profit, 0),
    SUM(COALESCE(md.profit, 0)) OVER (ORDER BY m.m_num) as cumulative,
    COALESCE(md.a_share, 0),
    COALESCE(md.c_share, 0),
    COALESCE(md.exp, 0)
  FROM months m
  LEFT JOIN monthly_data md ON m.m_num = md.m_num
  ORDER BY m.m_num;
END;
$$;

-- RPC функция для прогноза выручки
CREATE OR REPLACE FUNCTION get_admin_forecast(_token_id uuid, _months_ahead integer DEFAULT 6)
RETURNS TABLE(
  month_name text,
  month_index integer,
  year_num integer,
  expected_amount numeric,
  received_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end_date date;
BEGIN
  PERFORM set_session_context(_token_id);
  
  IF NOT is_admin(_token_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  v_end_date := CURRENT_DATE + (_months_ahead || ' months')::interval;
  
  RETURN QUERY
  WITH forecast_data AS (
    SELECT
      EXTRACT(YEAR FROM i.payment_date)::integer as y,
      EXTRACT(MONTH FROM i.payment_date)::integer as m,
      CASE 
        WHEN i.actual_payment_date IS NOT NULL THEN ic.client_bill
        ELSE 0
      END as received,
      CASE 
        WHEN i.status = 'sent' AND i.actual_payment_date IS NULL THEN ic.client_bill
        ELSE 0
      END as expected
    FROM invoices i
    INNER JOIN invoice_calculations ic ON ic.invoice_id = i.id
    WHERE i.payment_date IS NOT NULL
      AND i.payment_date >= CURRENT_DATE
      AND i.payment_date <= v_end_date
  )
  SELECT
    CASE m
      WHEN 1 THEN 'Янв' WHEN 2 THEN 'Фев' WHEN 3 THEN 'Мар'
      WHEN 4 THEN 'Апр' WHEN 5 THEN 'Май' WHEN 6 THEN 'Июн'
      WHEN 7 THEN 'Июл' WHEN 8 THEN 'Авг' WHEN 9 THEN 'Сен'
      WHEN 10 THEN 'Окт' WHEN 11 THEN 'Ноя' WHEN 12 THEN 'Дек'
    END || ' ' || y::text,
    m,
    y,
    COALESCE(SUM(expected), 0),
    COALESCE(SUM(received), 0)
  FROM forecast_data
  GROUP BY y, m
  ORDER BY y, m;
END;
$$;

-- RPC функция для героических метрик
CREATE OR REPLACE FUNCTION get_admin_hero_metrics(_token_id uuid, _period text DEFAULT 'month')
RETURNS TABLE(
  my_net_profit numeric,
  working_capital numeric,
  leverage_ratio numeric,
  working_capital_warning boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date date;
BEGIN
  PERFORM set_session_context(_token_id);
  
  IF NOT is_admin(_token_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Определяем стартовую дату в зависимости от периода
  v_start_date := CASE _period
    WHEN 'month' THEN date_trunc('month', CURRENT_DATE)
    WHEN 'year' THEN date_trunc('year', CURRENT_DATE)
    ELSE '1970-01-01'::date
  END;
  
  RETURN QUERY
  WITH profit_data AS (
    SELECT
      COALESCE(SUM(ic.admin_share_50), 0) as my_profit,
      COALESCE(SUM(ic.net_profit_admin), 0) as total_profit
    FROM invoices i
    INNER JOIN invoice_calculations ic ON ic.invoice_id = i.id
    WHERE i.status = 'paid'
      AND i.actual_payment_date IS NOT NULL
      AND i.actual_payment_date >= v_start_date
  ),
  wc_data AS (
    SELECT COALESCE(amount, 0) as wc
    FROM working_capital_balance
    ORDER BY updated_at DESC
    LIMIT 1
  )
  SELECT
    pd.my_profit,
    wd.wc,
    CASE WHEN pd.my_profit > 0 THEN (pd.total_profit - pd.my_profit) / pd.my_profit ELSE 0 END,
    wd.wc < 300000
  FROM profit_data pd, wc_data wd;
END;
$$;