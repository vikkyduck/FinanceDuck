-- Drop duplicate policy for assistants viewing expenses
DROP POLICY IF EXISTS "Assistants can view their own expenses" ON public.executor_expenses;

-- Update the main policy to allow assistants to view all expenses for non-hidden invoices
DROP POLICY IF EXISTS "Assistants can view expenses for all invoices" ON public.executor_expenses;

CREATE POLICY "Assistants can view all expenses for visible invoices"
ON public.executor_expenses
FOR SELECT
TO authenticated
USING (
  is_assistant(get_session_token_id())
  AND invoice_id IN (
    SELECT id FROM invoices 
    WHERE hidden_from_assistant = false
  )
);