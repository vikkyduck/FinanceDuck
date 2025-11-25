
-- Add unique constraint on invoice_id to invoice_calculations table
-- This is required for ON CONFLICT clause in recalculate_invoice_totals() trigger
-- Logically, each invoice should have exactly one calculation record

ALTER TABLE public.invoice_calculations
ADD CONSTRAINT invoice_calculations_invoice_id_unique UNIQUE (invoice_id);
