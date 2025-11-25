-- Fix recalculate_invoice_totals() to handle both invoices and executor_expenses tables
CREATE OR REPLACE FUNCTION public.recalculate_invoice_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_scheme invoices.scheme%TYPE;
  v_client_bill numeric;
  v_partner_rate numeric;

  v_total_expenses numeric := 0;
  v_client_expenses numeric := 0;
  v_admin_expenses numeric := 0;

  v_client_base numeric := NULL;
  v_client_remaining numeric := NULL;

  v_agency_margin numeric := NULL;
  v_partner_share numeric := NULL;
  v_admin_share numeric := NULL;

  v_commission_rate numeric := NULL;
  v_commission_amount numeric := NULL;
  v_amount_to_admin numeric := NULL;

  v_net_profit_admin numeric := NULL;
BEGIN
  -- Determine invoice_id based on which table triggered this
  IF TG_TABLE_NAME = 'invoices' THEN
    -- For invoices table, NEW.id is the invoice_id
    v_invoice_id := NEW.id;
    
    -- For UPDATE on invoices, only recalculate if relevant fields changed
    IF TG_OP = 'UPDATE' AND NOT (
      OLD.scheme IS DISTINCT FROM NEW.scheme OR
      OLD.partner_commission_rate IS DISTINCT FROM NEW.partner_commission_rate
    ) THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'executor_expenses' THEN
    -- For executor_expenses table, get invoice_id from the record
    IF TG_OP = 'DELETE' THEN
      v_invoice_id := OLD.invoice_id;
    ELSE
      v_invoice_id := NEW.invoice_id;
    END IF;
  ELSE
    -- Fallback for other tables (if any)
    IF TG_OP = 'DELETE' THEN
      v_invoice_id := OLD.invoice_id;
    ELSE
      v_invoice_id := NEW.invoice_id;
    END IF;
  END IF;

  -- Get scheme, rate and client_bill from invoices table
  SELECT i.scheme,
         i.partner_commission_rate,
         ic.client_bill
  INTO v_scheme, v_partner_rate, v_client_bill
  FROM public.invoices i
  LEFT JOIN public.invoice_calculations ic ON ic.invoice_id = i.id
  WHERE i.id = v_invoice_id;

  IF v_client_bill IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sum executor expenses
  SELECT 
    COALESCE(SUM(amount), 0) AS total_expenses,
    COALESCE(SUM(CASE WHEN COALESCE(is_admin_expense, false) THEN 0 ELSE amount END), 0) AS client_expenses,
    COALESCE(SUM(CASE WHEN COALESCE(is_admin_expense, false) THEN amount ELSE 0 END), 0) AS admin_expenses
  INTO v_total_expenses, v_client_expenses, v_admin_expenses
  FROM public.executor_expenses
  WHERE invoice_id = v_invoice_id;

  IF v_scheme = 'agency_30' THEN
    v_agency_margin := v_client_bill * 0.30;
    v_partner_share := v_agency_margin / 2;
    v_admin_share := v_agency_margin / 2;

    v_client_base := v_client_bill * 0.70;
    v_client_remaining := v_client_base - v_total_expenses;

    v_net_profit_admin := v_admin_share;

    v_commission_rate := NULL;
    v_commission_amount := NULL;
    v_amount_to_admin := v_admin_share + v_admin_expenses;
  ELSE
    v_commission_rate := COALESCE(v_partner_rate, 10);
    v_commission_amount := v_client_bill * (v_commission_rate / 100.0);
    
    v_amount_to_admin := (v_client_bill - v_commission_amount) + v_admin_expenses;
    
    v_client_base := v_client_bill - v_commission_amount;
    v_client_remaining := v_client_base - v_total_expenses;
    
    v_net_profit_admin := (v_client_bill - v_commission_amount) - v_client_expenses;
    
    v_agency_margin := NULL;
    v_partner_share := NULL;
    v_admin_share := NULL;
  END IF;

  -- Update or insert calculations
  INSERT INTO public.invoice_calculations (
    invoice_id,
    client_bill,
    executor_expenses_total,
    client_spent,
    client_base_after_margin,
    client_remaining,
    agency_margin,
    partner_share_from_margin,
    admin_share_from_margin,
    commission_rate,
    commission_amount,
    amount_to_admin,
    net_profit_admin,
    admin_share_50,
    cat_share_50
  ) VALUES (
    v_invoice_id,
    v_client_bill,
    v_total_expenses,
    v_total_expenses,
    v_client_base,
    v_client_remaining,
    v_agency_margin,
    v_partner_share,
    v_admin_share,
    v_commission_rate,
    v_commission_amount,
    v_amount_to_admin,
    v_net_profit_admin,
    CASE WHEN v_net_profit_admin IS NOT NULL THEN v_net_profit_admin / 2 ELSE NULL END,
    CASE WHEN v_net_profit_admin IS NOT NULL THEN v_net_profit_admin / 2 ELSE NULL END
  )
  ON CONFLICT (invoice_id) DO UPDATE SET
    executor_expenses_total = EXCLUDED.executor_expenses_total,
    client_spent = EXCLUDED.client_spent,
    client_base_after_margin = EXCLUDED.client_base_after_margin,
    client_remaining = EXCLUDED.client_remaining,
    agency_margin = EXCLUDED.agency_margin,
    partner_share_from_margin = EXCLUDED.partner_share_from_margin,
    admin_share_from_margin = EXCLUDED.admin_share_from_margin,
    commission_rate = EXCLUDED.commission_rate,
    commission_amount = EXCLUDED.commission_amount,
    amount_to_admin = EXCLUDED.amount_to_admin,
    net_profit_admin = EXCLUDED.net_profit_admin,
    admin_share_50 = EXCLUDED.admin_share_50,
    cat_share_50 = EXCLUDED.cat_share_50,
    updated_at = now();

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

-- Recreate triggers to ensure they use the updated function
DROP TRIGGER IF EXISTS recalculate_on_invoice_change ON public.invoices;
CREATE TRIGGER recalculate_on_invoice_change
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_invoice_totals();

DROP TRIGGER IF EXISTS recalculate_on_expense_change ON public.executor_expenses;
CREATE TRIGGER recalculate_on_expense_change
  AFTER INSERT OR UPDATE OR DELETE ON public.executor_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_invoice_totals();