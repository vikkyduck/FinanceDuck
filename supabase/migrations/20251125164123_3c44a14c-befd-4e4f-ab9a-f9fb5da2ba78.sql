-- Fix automatic recalculation when partner commission rate changes
-- Remove the old trigger that calls wrong function
DROP TRIGGER IF EXISTS on_invoice_commission_change ON public.invoices;
DROP FUNCTION IF EXISTS public.trigger_recalc_on_commission_change();

-- Add trigger to recalculate when partner_commission_rate changes
-- This will use the existing recalculate_invoice_totals function
CREATE TRIGGER on_partner_commission_rate_update
  AFTER UPDATE OF partner_commission_rate ON public.invoices
  FOR EACH ROW
  WHEN (OLD.partner_commission_rate IS DISTINCT FROM NEW.partner_commission_rate)
  EXECUTE FUNCTION public.recalculate_invoice_totals();