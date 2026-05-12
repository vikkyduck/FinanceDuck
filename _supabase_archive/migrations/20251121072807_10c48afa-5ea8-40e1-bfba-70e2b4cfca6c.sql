-- Allow clients to see executor expenses for their own invoices
CREATE POLICY "Clients can view expenses for their invoices"
ON public.executor_expenses
FOR SELECT
USING (
  invoice_id IN (
    SELECT invoices.id
    FROM public.invoices
    WHERE invoices.client_id = get_token_client_id(get_session_token_id())
  )
);

-- Cascade delete all related data when an invoice is deleted
CREATE OR REPLACE FUNCTION public.cascade_delete_invoice_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete related executor expenses
  DELETE FROM public.executor_expenses WHERE invoice_id = OLD.id;

  -- Delete related invoice documents
  DELETE FROM public.invoice_documents WHERE invoice_id = OLD.id;

  -- Delete related invoice calculations
  DELETE FROM public.invoice_calculations WHERE invoice_id = OLD.id;

  -- Delete related client payments
  DELETE FROM public.client_payments WHERE invoice_id = OLD.id;

  -- Delete related partner payments
  DELETE FROM public.partner_payments WHERE invoice_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cascade_delete_invoice_dependencies ON public.invoices;

CREATE TRIGGER cascade_delete_invoice_dependencies
BEFORE DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.cascade_delete_invoice_dependencies();