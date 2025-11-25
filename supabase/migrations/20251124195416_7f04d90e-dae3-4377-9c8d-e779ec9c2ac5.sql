-- Ensure assistants can see expenses they created regardless of invoice visibility
DROP POLICY IF EXISTS "Assistants can view all expenses for visible invoices" ON public.executor_expenses;

CREATE POLICY "Assistants can view expenses"
ON public.executor_expenses
FOR SELECT
TO authenticated
USING (
  is_assistant(get_session_token_id())
  AND (
    -- Can see expenses for non-hidden invoices
    invoice_id IN (
      SELECT id FROM invoices 
      WHERE hidden_from_assistant = false
    )
    -- OR can see expenses they created themselves
    OR created_by = get_session_token_id()
  )
);