-- Fix check constraint to allow new document types for bonus calculation
-- Keep old types for backward compatibility (existing documents use 'act')

ALTER TABLE public.invoice_documents 
DROP CONSTRAINT IF EXISTS invoice_documents_document_type_check;

ALTER TABLE public.invoice_documents
ADD CONSTRAINT invoice_documents_document_type_check
CHECK (document_type = ANY (ARRAY[
  'act'::text,
  'invoice'::text,
  'contract'::text,
  'other'::text,
  'client_act'::text,
  'executor_receipt'::text
]));