CREATE OR REPLACE FUNCTION public.create_session(
  _access_token_id uuid,
  _ip_address text DEFAULT NULL::text,
  _user_agent text DEFAULT NULL::text
)
RETURNS TABLE(session_id text, csrf_token text, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session_id TEXT;
  v_csrf_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Generate secure random tokens using pgcrypto in the extensions schema
  v_session_id := encode(extensions.gen_random_bytes(32), 'base64');
  v_csrf_token := encode(extensions.gen_random_bytes(32), 'base64');
  v_expires_at := now() + interval '30 minutes';
  
  -- Create session
  INSERT INTO public.user_sessions (
    session_id,
    access_token_id,
    csrf_token,
    ip_address,
    user_agent,
    expires_at
  ) VALUES (
    v_session_id,
    _access_token_id,
    v_csrf_token,
    _ip_address,
    _user_agent,
    v_expires_at
  );
  
  RETURN QUERY SELECT v_session_id, v_csrf_token, v_expires_at;
END;
$$;