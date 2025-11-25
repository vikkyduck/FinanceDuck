-- Simplify RLS policy for assistants viewing expenses
DROP POLICY IF EXISTS "Assistants can view expenses" ON public.executor_expenses;

-- Create simple policy: assistants see all expenses for non-hidden invoices
CREATE POLICY "Assistants view expenses for non-hidden invoices"
ON public.executor_expenses
FOR SELECT
TO authenticated
USING (
  is_assistant(get_session_token_id())
  AND EXISTS (
    SELECT 1 FROM invoices 
    WHERE invoices.id = executor_expenses.invoice_id 
    AND invoices.hidden_from_assistant = false
  )
);

-- Also allow assistants to update expenses (for editing)
CREATE POLICY "Assistants can update expenses"
ON public.executor_expenses
FOR UPDATE
TO authenticated
USING (
  is_assistant(get_session_token_id())
  AND EXISTS (
    SELECT 1 FROM invoices 
    WHERE invoices.id = executor_expenses.invoice_id 
    AND invoices.hidden_from_assistant = false
  )
)
WITH CHECK (
  is_assistant(get_session_token_id())
  AND EXISTS (
    SELECT 1 FROM invoices 
    WHERE invoices.id = executor_expenses.invoice_id 
    AND invoices.hidden_from_assistant = false
  )
);