-- Ensure session context functions work correctly for all roles
-- This migration improves RLS policy functions to be more reliable

-- Drop and recreate get_session_token_id to ensure it works correctly
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
  -- Try to get from session context first
  token_id := current_setting('app.current_token_id', true)::uuid;
  
  IF token_id IS NULL THEN
    RAISE WARNING 'No token_id in session context';
  END IF;
  
  RETURN token_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error getting session token_id: %', SQLERRM;
    RETURN NULL;
END;
$$;

-- Drop and recreate set_session_context to be more robust
CREATE OR REPLACE FUNCTION public.set_session_context(_token_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set the token_id in session context
  PERFORM set_config('app.current_token_id', _token_id::text, false);
  
  RAISE DEBUG 'Session context set for token_id: %', _token_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error setting session context: %', SQLERRM;
END;
$$;

-- Ensure helper functions use SECURITY DEFINER and proper error handling
CREATE OR REPLACE FUNCTION public.is_admin(_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM access_tokens
  WHERE id = _token_id AND is_active = true;
  
  RETURN user_role = 'admin';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in is_admin: %', SQLERRM;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_assistant(_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM access_tokens
  WHERE id = _token_id AND is_active = true;
  
  RETURN user_role = 'assistant';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in is_assistant: %', SQLERRM;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_partner(_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM access_tokens
  WHERE id = _token_id AND is_active = true;
  
  RETURN user_role = 'partner';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in is_partner: %', SQLERRM;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_client(_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM access_tokens
  WHERE id = _token_id AND is_active = true;
  
  RETURN user_role = 'client';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in is_client: %', SQLERRM;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_token_partner_id(_token_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_id uuid;
BEGIN
  SELECT partner_id INTO p_id
  FROM access_tokens
  WHERE id = _token_id AND is_active = true;
  
  RETURN p_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in get_token_partner_id: %', SQLERRM;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_token_client_id(_token_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_id uuid;
BEGIN
  SELECT client_id INTO c_id
  FROM access_tokens
  WHERE id = _token_id AND is_active = true;
  
  RETURN c_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in get_token_client_id: %', SQLERRM;
    RETURN NULL;
END;
$$;

-- Add indexes to improve RLS policy performance
CREATE INDEX IF NOT EXISTS idx_access_tokens_active ON access_tokens(id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_access_tokens_role ON access_tokens(role) WHERE is_active = true;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_session_token_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.set_session_context(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_assistant(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_partner(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_client(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_token_partner_id(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_token_client_id(uuid) TO authenticated, anon;