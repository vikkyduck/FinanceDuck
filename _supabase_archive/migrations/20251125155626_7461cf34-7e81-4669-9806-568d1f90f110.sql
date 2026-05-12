-- Создаём функцию для пересчёта при изменении partner_commission_rate
CREATE OR REPLACE FUNCTION public.trigger_recalc_on_commission_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Вызываем пересчёт только если изменился partner_commission_rate
  IF (TG_OP = 'UPDATE' AND OLD.partner_commission_rate IS DISTINCT FROM NEW.partner_commission_rate) THEN
    -- Вызываем пересчёт для этого счёта
    PERFORM recalculate_all_invoices(_invoice_id := NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Удаляем старый триггер, если существует
DROP TRIGGER IF EXISTS on_invoice_commission_change ON public.invoices;

-- Создаём триггер на изменение partner_commission_rate
CREATE TRIGGER on_invoice_commission_change
  AFTER UPDATE OF partner_commission_rate ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalc_on_commission_change();