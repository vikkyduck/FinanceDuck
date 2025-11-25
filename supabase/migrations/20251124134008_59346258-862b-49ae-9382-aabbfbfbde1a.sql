-- Add RLS policy for assistants to view expenses they created
CREATE POLICY "Assistants can view their own expenses"
ON public.executor_expenses
FOR SELECT
TO authenticated
USING (
  is_assistant(get_session_token_id()) 
  AND created_by = get_session_token_id()
);