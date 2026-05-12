-- Phase 2: Enhanced Authentication Functions

-- Function to check if an access code is locked due to failed attempts
CREATE OR REPLACE FUNCTION public.check_login_lockout(_access_code TEXT)
RETURNS TABLE (
  is_locked BOOLEAN,
  locked_until TIMESTAMP WITH TIME ZONE,
  attempt_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed_count INTEGER;
  v_lockout_until TIMESTAMP WITH TIME ZONE;
  v_lockout_minutes INTEGER;
BEGIN
  -- Count failed attempts in last 15 minutes
  SELECT COUNT(*) INTO v_failed_count
  FROM login_attempts
  WHERE access_code = UPPER(_access_code)
    AND success = false
    AND created_at > NOW() - INTERVAL '15 minutes';

  -- Calculate lockout based on failed attempts
  -- 5 failures = 5 min, 10 = 15 min, 15 = 60 min, 20+ = 1440 min (24h)
  IF v_failed_count >= 20 THEN
    v_lockout_minutes := 1440;
  ELSIF v_failed_count >= 15 THEN
    v_lockout_minutes := 60;
  ELSIF v_failed_count >= 10 THEN
    v_lockout_minutes := 15;
  ELSIF v_failed_count >= 5 THEN
    v_lockout_minutes := 5;
  ELSE
    v_lockout_minutes := 0;
  END IF;

  IF v_lockout_minutes > 0 THEN
    v_lockout_until := NOW() + (v_lockout_minutes || ' minutes')::INTERVAL;
    RETURN QUERY SELECT true, v_lockout_until, v_failed_count;
  ELSE
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, v_failed_count;
  END IF;
END;
$$;

-- Enhanced verify_access_code with security logging
CREATE OR REPLACE FUNCTION public.verify_access_code(_code TEXT, _ip_address TEXT DEFAULT NULL, _user_agent TEXT DEFAULT NULL)
RETURNS TABLE (
  token_id UUID,
  role user_role,
  partner_id UUID,
  client_id UUID,
  is_valid BOOLEAN,
  is_locked BOOLEAN,
  locked_until TIMESTAMP WITH TIME ZONE,
  attempts_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_lockout RECORD;
  v_failed_count INTEGER;
BEGIN
  -- Check for lockout first
  SELECT * INTO v_lockout FROM check_login_lockout(UPPER(_code));
  
  IF v_lockout.is_locked THEN
    -- Log locked attempt
    INSERT INTO login_attempts (access_code, success, ip_address, user_agent, failure_reason)
    VALUES (UPPER(_code), false, _ip_address, _user_agent, 'account_locked');
    
    -- Create security event for locked account attempt
    INSERT INTO security_events (
      event_type, severity, user_identifier, ip_address, user_agent,
      details
    ) VALUES (
      'account_locked', 'high', UPPER(_code), _ip_address, _user_agent,
      jsonb_build_object(
        'failed_attempts', v_lockout.attempt_count,
        'locked_until', v_lockout.locked_until
      )
    );
    
    RETURN QUERY SELECT 
      NULL::UUID, NULL::user_role, NULL::UUID, NULL::UUID, 
      false, true, v_lockout.locked_until, 
      GREATEST(5 - v_lockout.attempt_count, 0);
    RETURN;
  END IF;

  -- Try to find valid token
  SELECT 
    id, access_tokens.role, access_tokens.partner_id, access_tokens.client_id,
    (is_active = true AND (expires_at IS NULL OR expires_at > NOW())) AS valid
  INTO v_token
  FROM access_tokens
  WHERE code = UPPER(_code)
  LIMIT 1;
  
  IF v_token.id IS NOT NULL AND v_token.valid THEN
    -- Successful login
    INSERT INTO login_attempts (access_code, success, token_id, ip_address, user_agent)
    VALUES (UPPER(_code), true, v_token.id, _ip_address, _user_agent);
    
    -- Log security event
    INSERT INTO security_events (
      event_type, severity, user_identifier, token_id, ip_address, user_agent,
      details
    ) VALUES (
      'login_success', 'low', UPPER(_code), v_token.id, _ip_address, _user_agent,
      jsonb_build_object('role', v_token.role)
    );
    
    -- Update last_used_at and extend expires_at by 12 months
    UPDATE access_tokens
    SET 
      last_used_at = NOW(),
      expires_at = NOW() + INTERVAL '12 months'
    WHERE code = UPPER(_code);
    
    RETURN QUERY SELECT 
      v_token.id, v_token.role, v_token.partner_id, v_token.client_id,
      true, false, NULL::TIMESTAMP WITH TIME ZONE,
      5 - v_lockout.attempt_count;
  ELSE
    -- Failed login
    INSERT INTO login_attempts (access_code, success, ip_address, user_agent, failure_reason)
    VALUES (
      UPPER(_code), false, _ip_address, _user_agent,
      CASE 
        WHEN v_token.id IS NULL THEN 'invalid_code'
        WHEN NOT v_token.valid THEN 'inactive_or_expired'
        ELSE 'unknown'
      END
    );
    
    -- Calculate new failed count
    v_failed_count := v_lockout.attempt_count + 1;
    
    -- Log security event for failed attempt
    INSERT INTO security_events (
      event_type, 
      severity, 
      user_identifier, 
      ip_address, 
      user_agent,
      details
    ) VALUES (
      'login_failure',
      CASE WHEN v_failed_count >= 5 THEN 'high'::security_severity ELSE 'medium'::security_severity END,
      UPPER(_code),
      _ip_address,
      _user_agent,
      jsonb_build_object(
        'failed_attempts', v_failed_count,
        'reason', CASE 
          WHEN v_token.id IS NULL THEN 'invalid_code'
          WHEN NOT v_token.valid THEN 'inactive_or_expired'
          ELSE 'unknown'
        END
      )
    );
    
    RETURN QUERY SELECT 
      NULL::UUID, NULL::user_role, NULL::UUID, NULL::UUID,
      false, false, NULL::TIMESTAMP WITH TIME ZONE,
      GREATEST(5 - v_failed_count, 0);
  END IF;
END;
$$;