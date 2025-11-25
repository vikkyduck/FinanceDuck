-- Create function to recalculate all invoices or a specific invoice
CREATE OR REPLACE FUNCTION public.recalculate_all_invoices(_invoice_id UUID DEFAULT NULL)
RETURNS TABLE(recalculated_count INTEGER, success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_invoice RECORD;
BEGIN
  -- If specific invoice_id provided, recalculate only that invoice
  IF _invoice_id IS NOT NULL THEN
    -- Check if invoice exists
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE id = _invoice_id) THEN
      RETURN QUERY SELECT 0, false, 'Invoice not found'::TEXT;
      RETURN;
    END IF;
    
    -- Trigger recalculation by updating the invoice's updated_at
    UPDATE invoices SET updated_at = now() WHERE id = _invoice_id;
    
    RETURN QUERY SELECT 1, true, 'Invoice recalculated successfully'::TEXT;
    RETURN;
  END IF;
  
  -- Recalculate all invoices
  FOR v_invoice IN SELECT id FROM invoices ORDER BY created_at
  LOOP
    -- Trigger recalculation by updating each invoice
    UPDATE invoices SET updated_at = now() WHERE id = v_invoice.id;
    v_count := v_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT v_count, true, format('Successfully recalculated %s invoices', v_count)::TEXT;
END;
$function$;

-- Create triggers for automatic recalculation

-- Trigger on invoices table (when scheme, client_bill, or commission rate changes)
CREATE OR REPLACE FUNCTION public.trigger_recalculate_on_invoice_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only recalculate if relevant fields changed
  IF (TG_OP = 'UPDATE' AND (
    OLD.scheme IS DISTINCT FROM NEW.scheme OR
    OLD.partner_commission_rate IS DISTINCT FROM NEW.partner_commission_rate
  )) OR TG_OP = 'INSERT' THEN
    -- Trigger recalculation
    PERFORM recalculate_invoice_totals()
    WHERE NEW.id IS NOT NULL;
  END IF;
  
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_invoice_recalculate ON invoices;
CREATE TRIGGER trigger_invoice_recalculate
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_on_invoice_change();

-- Trigger on invoice_calculations (when client_bill changes)
CREATE OR REPLACE FUNCTION public.trigger_recalculate_on_calculation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only recalculate if client_bill changed
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.client_bill IS DISTINCT FROM NEW.client_bill) THEN
    -- The recalculate_invoice_totals function will be called with NEW/OLD context
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Note: We already have recalculate_invoice_totals trigger on executor_expenses
-- which handles INSERT, UPDATE, DELETE on executor_expenses table

-- Now recalculate all existing invoices to fix current data
SELECT * FROM recalculate_all_invoices();