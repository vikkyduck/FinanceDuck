-- Fix context variable name mismatch
CREATE OR REPLACE FUNCTION public.get_session_token_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_id uuid;
BEGIN
  -- Use the same variable name as set_session_context (app.access_token_id)
  token_id := current_setting('app.access_token_id', true)::uuid;
  
  IF token_id IS NULL THEN
    RAISE WARNING 'No token_id in session context (app.access_token_id)';
  END IF;
  
  RETURN token_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error getting session token_id: %', SQLERRM;
    RETURN NULL;
END;
$$;

-- Keep original set_session_context that uses app.access_token_id
CREATE OR REPLACE FUNCTION public.set_session_context(_token_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Keep using app.access_token_id to match existing code
  PERFORM set_config('app.access_token_id', _token_id::text, false);
  
  RAISE DEBUG 'Session context set for token_id: %', _token_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error setting session context: %', SQLERRM;
END;
$$;