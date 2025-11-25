-- Fix RLS policies for assistants - change role from authenticated to public
-- since this project uses custom auth via access_tokens, not Supabase Auth

DROP POLICY IF EXISTS "Assistants see all expenses" ON public.executor_expenses;
DROP POLICY IF EXISTS "Assistants modify all expenses" ON public.executor_expenses;

-- Recreate with correct role (public instead of authenticated)
CREATE POLICY "Assistants see all expenses" 
ON public.executor_expenses 
FOR SELECT 
TO public
USING (is_assistant(get_session_token_id()));

CREATE POLICY "Assistants modify all expenses" 
ON public.executor_expenses 
FOR ALL 
TO public
USING (is_assistant(get_session_token_id()))
WITH CHECK (is_assistant(get_session_token_id()));