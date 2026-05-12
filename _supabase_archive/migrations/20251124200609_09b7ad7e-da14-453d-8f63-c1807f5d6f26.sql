-- CRITICAL FIX: Simplify RLS for assistants to see expenses
-- Drop all existing assistant policies for executor_expenses
DROP POLICY IF EXISTS "Assistants view expenses for non-hidden invoices" ON public.executor_expenses;
DROP POLICY IF EXISTS "Assistants can update expenses" ON public.executor_expenses;
DROP POLICY IF EXISTS "Assistants can delete expenses for all invoices" ON public.executor_expenses;
DROP POLICY IF EXISTS "Assistants can insert expenses for all invoices" ON public.executor_expenses;
DROP POLICY IF EXISTS "Assistants can view expenses for all invoices" ON public.executor_expenses;

-- Create ONE simple policy: assistants can do EVERYTHING with expenses for visible invoices
CREATE POLICY "Assistants full access to non-hidden invoice expenses"
ON public.executor_expenses
FOR ALL
TO authenticated
USING (
  is_assistant(get_session_token_id())
  AND NOT EXISTS (
    SELECT 1 FROM invoices 
    WHERE invoices.id = executor_expenses.invoice_id 
    AND invoices.hidden_from_assistant = true
  )
)
WITH CHECK (
  is_assistant(get_session_token_id())
  AND NOT EXISTS (
    SELECT 1 FROM invoices 
    WHERE invoices.id = executor_expenses.invoice_id 
    AND invoices.hidden_from_assistant = true
  )
);