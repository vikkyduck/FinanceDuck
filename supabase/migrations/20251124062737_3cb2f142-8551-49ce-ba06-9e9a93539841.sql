-- Allow assistants to manage expenses for ALL invoices (including hidden ones)
-- since expense management is their responsibility

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Assistants can insert expenses" ON public.executor_expenses;
DROP POLICY IF EXISTS "Assistants can view all expenses" ON public.executor_expenses;
DROP POLICY IF EXISTS "Assistants can delete expenses" ON public.executor_expenses;

-- Create new policies allowing access to all invoices for assistants
CREATE POLICY "Assistants can insert expenses for all invoices"
ON public.executor_expenses
FOR INSERT
TO authenticated
WITH CHECK (is_assistant(get_session_token_id()));

CREATE POLICY "Assistants can view expenses for all invoices"
ON public.executor_expenses
FOR SELECT
TO authenticated
USING (is_assistant(get_session_token_id()));

CREATE POLICY "Assistants can delete expenses for all invoices"
ON public.executor_expenses
FOR DELETE
TO authenticated
USING (is_assistant(get_session_token_id()));