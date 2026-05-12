-- Remove approval workflow columns from invoices table
ALTER TABLE public.invoices 
  DROP COLUMN IF EXISTS requires_approval,
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS approval_notes;

-- Note: We keep 'pending_approval' in the invoice_status enum as removing enum values
-- in PostgreSQL is complex and could cause issues. It won't be used anymore.