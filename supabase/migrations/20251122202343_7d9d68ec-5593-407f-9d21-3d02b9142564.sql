
-- Systemic fix: ensure ON CONFLICT (invoice_id) on reconciliation_records works
-- We maintain at most one reconciliation record per invoice.

ALTER TABLE public.reconciliation_records
ADD CONSTRAINT reconciliation_records_invoice_id_unique UNIQUE (invoice_id);
