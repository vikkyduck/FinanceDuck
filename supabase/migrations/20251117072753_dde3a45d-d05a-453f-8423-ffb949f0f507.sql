-- Create storage bucket for invoice documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('invoice-documents', 'invoice-documents', false);

-- RLS policies for invoice documents storage
CREATE POLICY "Authenticated users can upload invoice documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'invoice-documents');

CREATE POLICY "Authenticated users can view invoice documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'invoice-documents');

CREATE POLICY "Users can delete their uploaded documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'invoice-documents');

-- Create table for invoice documents metadata
CREATE TABLE public.invoice_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  document_type TEXT NOT NULL CHECK (document_type IN ('act', 'invoice', 'contract', 'other')),
  notes TEXT
);

CREATE INDEX idx_invoice_documents_invoice_id ON public.invoice_documents(invoice_id);

-- Enable RLS on invoice_documents
ALTER TABLE public.invoice_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoice_documents table
CREATE POLICY "Anyone can view invoice documents"
ON public.invoice_documents FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert invoice documents"
ON public.invoice_documents FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can delete their uploaded documents"
ON public.invoice_documents FOR DELETE
TO authenticated
USING (true);

-- Trigger to update assistant_bonus_acts when act is uploaded
CREATE OR REPLACE FUNCTION public.increment_assistant_bonus_acts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.document_type = 'act' THEN
    UPDATE public.invoice_calculations
    SET assistant_bonus_acts = COALESCE(assistant_bonus_acts, 0) + 1,
        updated_at = now()
    WHERE invoice_id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_increment_assistant_bonus_acts
AFTER INSERT ON public.invoice_documents
FOR EACH ROW
EXECUTE FUNCTION public.increment_assistant_bonus_acts();