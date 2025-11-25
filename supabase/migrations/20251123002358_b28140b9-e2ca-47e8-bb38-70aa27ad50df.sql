-- Drop old function if exists
DROP FUNCTION IF EXISTS public.get_partner_debt_to_admin(uuid);

-- Create new function that works with invoices structure
CREATE OR REPLACE FUNCTION public.get_partner_debt_to_admin(_partner_id uuid)
RETURNS TABLE(
  total_inflow numeric,
  partner_commission numeric,
  partner_expenses numeric,
  admin_expenses numeric,
  debt_to_admin numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total_inflow NUMERIC := 0;
  v_partner_commission NUMERIC := 0;
  v_partner_expenses NUMERIC := 0;
  v_admin_expenses NUMERIC := 0;
BEGIN
  -- Calculate total inflow (client bills from paid invoices)
  SELECT COALESCE(SUM(ic.client_bill), 0)
  INTO v_total_inflow
  FROM invoices i
  INNER JOIN invoice_calculations ic ON i.id = ic.invoice_id
  WHERE i.partner_id = _partner_id
    AND i.status IN ('sent', 'paid');
  
  -- Calculate partner commission based on scheme
  SELECT COALESCE(SUM(
    CASE 
      WHEN i.scheme = 'agency_30' THEN ic.partner_share_from_margin
      WHEN i.scheme = 'commission_based' THEN ic.commission_amount
      ELSE 0
    END
  ), 0)
  INTO v_partner_commission
  FROM invoices i
  INNER JOIN invoice_calculations ic ON i.id = ic.invoice_id
  WHERE i.partner_id = _partner_id
    AND i.status IN ('sent', 'paid');
  
  -- Partner expenses are not tracked separately in current schema
  -- Setting to 0 for now
  v_partner_expenses := 0;
    
  -- Admin expenses from executor_expenses
  SELECT COALESCE(SUM(ee.amount), 0)
  INTO v_admin_expenses
  FROM executor_expenses ee
  INNER JOIN invoices i ON ee.invoice_id = i.id
  WHERE i.partner_id = _partner_id
    AND ee.is_admin_expense = true;
  
  -- Debt to admin = total_inflow - partner_commission - partner_expenses + admin_expenses
  RETURN QUERY SELECT
    v_total_inflow,
    v_partner_commission,
    v_partner_expenses,
    v_admin_expenses,
    (v_total_inflow - v_partner_commission - v_partner_expenses + v_admin_expenses) AS debt;
END;
$$;