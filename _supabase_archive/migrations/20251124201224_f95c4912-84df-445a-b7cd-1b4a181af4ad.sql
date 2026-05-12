-- Add logging to is_assistant function to debug
CREATE OR REPLACE FUNCTION public.is_assistant(_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_role text;
  session_token_id uuid;
BEGIN
  IF _token_id IS NULL THEN
    RAISE WARNING 'is_assistant called with NULL token_id';
    RETURN false;
  END IF;
  
  -- Also check session context
  BEGIN
    session_token_id := current_setting('app.access_token_id', true)::uuid;
    RAISE NOTICE 'is_assistant: token_id=%, session_token=%, match=%', 
      _token_id, session_token_id, (_token_id = session_token_id);
  EXCEPTION WHEN OTHERS THEN
    session_token_id := NULL;
  END;
  
  SELECT role INTO user_role
  FROM access_tokens
  WHERE id = _token_id AND is_active = true;
  
  RAISE NOTICE 'is_assistant: found role=% for token=%', user_role, _token_id;
  
  RETURN COALESCE(user_role = 'assistant', false);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in is_assistant for token %: %', _token_id, SQLERRM;
    RETURN false;
END;
$$;

-- Also update set_session_context to add logging
CREATE OR REPLACE FUNCTION public.set_session_context(_token_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM set_config('app.access_token_id', _token_id::text, false);
  RAISE NOTICE 'set_session_context: Set token % in session', _token_id;
END;
$$;