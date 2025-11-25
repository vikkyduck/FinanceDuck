-- Create server-side sessions table for cookie-based authentication
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  access_token_id UUID NOT NULL REFERENCES public.access_tokens(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Create index for performance
CREATE INDEX idx_user_sessions_session_id ON public.user_sessions(session_id) WHERE revoked = false;
CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions(expires_at) WHERE revoked = false;
CREATE INDEX idx_user_sessions_token_id ON public.user_sessions(access_token_id) WHERE revoked = false;

-- RLS Policy: Only allow server-side access (SECURITY DEFINER functions)
CREATE POLICY "Server-only access to sessions"
ON public.user_sessions
FOR ALL
USING (false);

-- Function to create session
CREATE OR REPLACE FUNCTION public.create_session(
  _access_token_id UUID,
  _ip_address TEXT DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL
)
RETURNS TABLE(session_id TEXT, csrf_token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id TEXT;
  v_csrf_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Generate secure random tokens
  v_session_id := encode(gen_random_bytes(32), 'base64');
  v_csrf_token := encode(gen_random_bytes(32), 'base64');
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

-- Function to validate session and return token info
CREATE OR REPLACE FUNCTION public.validate_session(
  _session_id TEXT,
  _csrf_token TEXT DEFAULT NULL
)
RETURNS TABLE(
  is_valid BOOLEAN,
  access_token_id UUID,
  role user_role,
  partner_id UUID,
  client_id UUID,
  csrf_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_token RECORD;
BEGIN
  -- Find active session
  SELECT * INTO v_session
  FROM public.user_sessions
  WHERE session_id = _session_id
    AND revoked = false
    AND expires_at > now()
  LIMIT 1;
  
  -- Session not found or expired
  IF v_session.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::user_role, NULL::UUID, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Validate CSRF token if provided
  IF _csrf_token IS NOT NULL AND v_session.csrf_token != _csrf_token THEN
    -- Log security event for CSRF mismatch
    INSERT INTO security_events (
      event_type,
      severity,
      token_id,
      details
    ) VALUES (
      'token_mismatch_attack',
      'high',
      v_session.access_token_id,
      jsonb_build_object(
        'reason', 'csrf_token_mismatch',
        'session_id', _session_id
      )
    );
    
    RETURN QUERY SELECT false, NULL::UUID, NULL::user_role, NULL::UUID, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Update last activity
  UPDATE public.user_sessions
  SET last_activity = now()
  WHERE id = v_session.id;
  
  -- Get token details
  SELECT * INTO v_token
  FROM public.access_tokens
  WHERE id = v_session.access_token_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
  
  IF v_token.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::user_role, NULL::UUID, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 
    true,
    v_token.id,
    v_token.role,
    v_token.partner_id,
    v_token.client_id,
    v_session.csrf_token;
END;
$$;

-- Function to refresh session
CREATE OR REPLACE FUNCTION public.refresh_session(_session_id TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_expires_at TIMESTAMPTZ;
BEGIN
  v_new_expires_at := now() + interval '30 minutes';
  
  UPDATE public.user_sessions
  SET 
    expires_at = v_new_expires_at,
    last_activity = now()
  WHERE session_id = _session_id
    AND revoked = false
    AND expires_at > now();
    
  RETURN v_new_expires_at;
END;
$$;

-- Function to revoke session
CREATE OR REPLACE FUNCTION public.revoke_session(_session_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_sessions
  SET revoked = true
  WHERE session_id = _session_id;
END;
$$;

-- Cleanup old sessions automatically (run this via cron or manually)
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.user_sessions
  WHERE expires_at < now() - interval '7 days'
    OR (revoked = true AND created_at < now() - interval '7 days');
    
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;