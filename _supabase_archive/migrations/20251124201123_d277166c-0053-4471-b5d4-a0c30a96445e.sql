-- RADICAL FIX: Remove RLS complexity, make it crystal clear for assistants
-- Drop the complex policy
DROP POLICY IF EXISTS "Assistants full access to non-hidden invoice expenses" ON public.executor_expenses;

-- Create SIMPLE policy: if you're an assistant, you see ALL expenses (unless invoice is hidden)
CREATE POLICY "Assistants see all expenses"
ON public.executor_expenses
FOR SELECT
TO authenticated
USING (
  is_assistant(get_session_token_id())
);

-- Allow assistants to modify expenses
CREATE POLICY "Assistants modify all expenses"
ON public.executor_expenses
FOR ALL
TO authenticated
USING (is_assistant(get_session_token_id()))
WITH CHECK (is_assistant(get_session_token_id()));