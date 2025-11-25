-- Drop old function first
DROP FUNCTION IF EXISTS public.get_partner_debt_to_admin(uuid);

-- Create new version with correct calculations and additional fields
CREATE OR REPLACE FUNCTION public.get_partner_debt_to_admin(_partner_id uuid)
RETURNS TABLE(
  total_inflow numeric,
  partner_commission numeric,
  partner_expenses numeric,
  admin_expenses numeric,
  debt_to_admin numeric,
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
    v_total_paid,
    (v_debt_to_admin - v_total_paid) AS remaining_debt;
END;
$function$;