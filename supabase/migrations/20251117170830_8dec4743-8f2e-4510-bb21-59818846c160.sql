-- Update invoice_calculations table with new bonus fields
ALTER TABLE public.invoice_calculations
ADD COLUMN IF NOT EXISTS assistant_bonus_client_acts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS assistant_bonus_executor_receipts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS assistant_bonus_total numeric DEFAULT 0;

-- Drop old bonus field (if exists)
ALTER TABLE public.invoice_calculations
DROP COLUMN IF EXISTS assistant_bonus_acts;

-- Create function to calculate assistant bonus
CREATE OR REPLACE FUNCTION public.calculate_assistant_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.document_type = 'client_act' THEN
      UPDATE public.invoice_calculations
      SET 
        assistant_bonus_client_acts = COALESCE(assistant_bonus_client_acts, 0) + 1,
        assistant_bonus_total = (COALESCE(assistant_bonus_client_acts, 0) + 1) * 2000 
                              + COALESCE(assistant_bonus_executor_receipts, 0) * 1000,
        updated_at = now()
      WHERE invoice_id = NEW.invoice_id;
      
    ELSIF NEW.document_type = 'executor_receipt' THEN
      UPDATE public.invoice_calculations
      SET 
        assistant_bonus_executor_receipts = COALESCE(assistant_bonus_executor_receipts, 0) + 1,
        assistant_bonus_total = COALESCE(assistant_bonus_client_acts, 0) * 2000 
                              + (COALESCE(assistant_bonus_executor_receipts, 0) + 1) * 1000,
        updated_at = now()
      WHERE invoice_id = NEW.invoice_id;
    END IF;
    
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.document_type = 'client_act' THEN
      UPDATE public.invoice_calculations
      SET 
        assistant_bonus_client_acts = GREATEST(COALESCE(assistant_bonus_client_acts, 0) - 1, 0),
        assistant_bonus_total = GREATEST(COALESCE(assistant_bonus_client_acts, 0) - 1, 0) * 2000 
                              + COALESCE(assistant_bonus_executor_receipts, 0) * 1000,
        updated_at = now()
      WHERE invoice_id = OLD.invoice_id;
      
    ELSIF OLD.document_type = 'executor_receipt' THEN
      UPDATE public.invoice_calculations
      SET 
        assistant_bonus_executor_receipts = GREATEST(COALESCE(assistant_bonus_executor_receipts, 0) - 1, 0),
        assistant_bonus_total = COALESCE(assistant_bonus_client_acts, 0) * 2000 
                              + GREATEST(COALESCE(assistant_bonus_executor_receipts, 0) - 1, 0) * 1000,
        updated_at = now()
      WHERE invoice_id = OLD.invoice_id;
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Drop old triggers if exist
DROP TRIGGER IF EXISTS on_document_upload_calculate_bonus ON public.invoice_documents;
DROP TRIGGER IF EXISTS on_document_delete_recalculate_bonus ON public.invoice_documents;
DROP TRIGGER IF EXISTS increment_assistant_bonus_acts ON public.invoice_documents;

-- Create triggers for bonus calculation
CREATE TRIGGER on_document_upload_calculate_bonus
AFTER INSERT ON public.invoice_documents
FOR EACH ROW
EXECUTE FUNCTION public.calculate_assistant_bonus();

CREATE TRIGGER on_document_delete_recalculate_bonus
AFTER DELETE ON public.invoice_documents
FOR EACH ROW
EXECUTE FUNCTION public.calculate_assistant_bonus();

-- Enable realtime for invoice_calculations
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_calculations;