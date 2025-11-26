-- Add client_remaining to get_partner_debt_to_admin function
DROP FUNCTION IF EXISTS public.get_partner_debt_to_admin(uuid);

CREATE OR REPLACE FUNCTION public.get_partner_debt_to_admin(_partner_id uuid)
RETURNS TABLE(
  total_inflow numeric,
  partner_commission numeric,
  partner_expenses numeric,
  admin_expenses numeric,
  debt_to_admin numeric,
  client_remaining_total numeric,
  total_paid_to_admin numeric,
  remaining_debt numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_inflow NUMERIC := 0;
  v_partner_commission NUMERIC := 0;
  v_partner_expenses NUMERIC := 0;
  v_admin_expenses NUMERIC := 0;
  v_debt_to_admin NUMERIC := 0;
  v_client_remaining NUMERIC := 0;
  v_total_paid NUMERIC := 0;
BEGIN
  -- Total inflow from paid invoices
  SELECT COALESCE(SUM(ic.client_bill), 0)
  INTO v_total_inflow
  FROM public.invoices i
  INNER JOIN public.invoice_calculations ic ON ic.invoice_id = i.id
  WHERE i.partner_id = _partner_id
    AND i.status = 'paid';

  -- Partner commission from paid invoices
  SELECT COALESCE(SUM(
    CASE 
      WHEN i.scheme = 'agency_30' THEN ic.partner_share_from_margin
      WHEN i.scheme = 'commission_based' THEN ic.commission_amount
      ELSE 0
    END
  ), 0)
  INTO v_partner_commission
  FROM public.invoices i
  INNER JOIN public.invoice_calculations ic ON ic.invoice_id = i.id
  WHERE i.partner_id = _partner_id
    AND i.status = 'paid';

  -- Partner expenses (executor expenses paid by partner)
  SELECT COALESCE(SUM(ee.amount), 0)
  INTO v_partner_expenses
  FROM public.executor_expenses ee
  INNER JOIN public.invoices i ON ee.invoice_id = i.id
  WHERE i.partner_id = _partner_id
    AND i.status = 'paid'
    AND COALESCE(ee.is_admin_expense, false) = false;

  -- Admin expenses (executor expenses paid by admin)
  SELECT COALESCE(SUM(ee.amount), 0)
  INTO v_admin_expenses
  FROM public.executor_expenses ee
  INNER JOIN public.invoices i ON ee.invoice_id = i.id
  WHERE i.partner_id = _partner_id
    AND i.status = 'paid'
    AND COALESCE(ee.is_admin_expense, false) = true;

  -- Use pre-calculated amount_to_admin from invoice_calculations
  SELECT COALESCE(SUM(ic.amount_to_admin), 0)
  INTO v_debt_to_admin
  FROM public.invoices i
  INNER JOIN public.invoice_calculations ic ON ic.invoice_id = i.id
  WHERE i.partner_id = _partner_id
    AND i.status = 'paid';

  -- Client remaining from paid invoices
  SELECT COALESCE(SUM(ic.client_remaining), 0)
  INTO v_client_remaining
  FROM public.invoices i
  INNER JOIN public.invoice_calculations ic ON ic.invoice_id = i.id
  WHERE i.partner_id = _partner_id
    AND i.status = 'paid';

  -- Total paid to admin by partner
  SELECT COALESCE(SUM(pp.amount), 0)
  INTO v_total_paid
  FROM public.partner_payments pp
  WHERE pp.partner_id = _partner_id;

  RETURN QUERY SELECT
    v_total_inflow,
    v_partner_commission,
    v_partner_expenses,
    v_admin_expenses,
    v_debt_to_admin,
    v_client_remaining,
    v_total_paid,
    (v_debt_to_admin - v_total_paid) AS remaining_debt;
END;
$function$;

-- Create get_admin_cashflow_forecast function
CREATE OR REPLACE FUNCTION public.get_admin_cashflow_forecast(_token_id uuid)
RETURNS TABLE(
  current_balance numeric,
  month_name text,
  month_index integer,
  expected_income numeric,
  expected_expenses numeric,
  net_flow numeric,
  cumulative_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_balance NUMERIC := 0;
  v_total_received NUMERIC := 0;
  v_total_paid_to_partners NUMERIC := 0;
  v_total_partner_debt NUMERIC := 0;
  v_cumulative NUMERIC := 0;
  i INTEGER;
  v_month_start DATE;
  v_month_end DATE;
  v_expected_income NUMERIC;
  v_expected_expense NUMERIC;
  v_net NUMERIC;
  v_month TEXT;
BEGIN
  -- Set session context for RLS
  PERFORM set_session_context(_token_id);
  
  -- Check if user is admin
  IF NOT is_admin(_token_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Calculate current balance
  SELECT COALESCE(SUM(ic.amount_to_admin), 0)
  INTO v_total_received
  FROM public.invoices i
  INNER JOIN public.invoice_calculations ic ON ic.invoice_id = i.id
  WHERE i.status = 'paid';

  SELECT COALESCE(SUM(pp.amount), 0)
  INTO v_total_paid_to_partners
  FROM public.partner_payments pp;

  v_current_balance := v_total_received - v_total_paid_to_partners;
  v_cumulative := v_current_balance;

  -- Calculate total partner debt for expense estimation
  SELECT COALESCE(SUM(
    CASE 
      WHEN i.scheme = 'agency_30' THEN COALESCE(ic.partner_share_from_margin, 0)
      WHEN i.scheme = 'commission_based' THEN COALESCE(ic.commission_amount, 0)
      ELSE 0
    END
  ), 0) - COALESCE((SELECT SUM(amount) FROM public.partner_payments), 0)
  INTO v_total_partner_debt
  FROM public.invoices i
  INNER JOIN public.invoice_calculations ic ON ic.invoice_id = i.id
  WHERE i.status IN ('sent', 'paid');

  -- Return current balance as first row
  RETURN QUERY SELECT
    v_current_balance,
    'Текущий баланс'::text,
    0,
    0::numeric,
    0::numeric,
    0::numeric,
    v_current_balance;

  -- Generate forecast for next 6 months
  FOR i IN 0..5 LOOP
    v_month_start := date_trunc('month', CURRENT_DATE + (i || ' months')::interval)::date;
    v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;
    
    v_month := to_char(v_month_start, 'TMMonth YYYY');

    -- Expected income from sent invoices with payment_date in this month
    SELECT COALESCE(SUM(ic.amount_to_admin), 0)
    INTO v_expected_income
    FROM public.invoices i
    INNER JOIN public.invoice_calculations ic ON ic.invoice_id = i.id
    WHERE i.status = 'sent'
      AND i.payment_date >= v_month_start
      AND i.payment_date <= v_month_end;

    -- Expected expenses (1/6 of total partner debt per month)
    v_expected_expense := GREATEST(v_total_partner_debt / 6, 0);

    v_net := v_expected_income - v_expected_expense;
    v_cumulative := v_cumulative + v_net;

    RETURN QUERY SELECT
      v_current_balance,
      v_month,
      i + 1,
      v_expected_income,
      v_expected_expense,
      v_net,
      v_cumulative;
  END LOOP;
END;
$function$;

-- Grant execute privileges
GRANT EXECUTE ON FUNCTION public.get_admin_cashflow_forecast(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_cashflow_forecast(uuid, numeric) TO service_role;
