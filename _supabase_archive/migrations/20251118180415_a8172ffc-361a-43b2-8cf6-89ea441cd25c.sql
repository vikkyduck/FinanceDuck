-- Update verify_access_code to extend token expiration by 12 months on each use
CREATE OR REPLACE FUNCTION public.verify_access_code(_code text)
RETURNS TABLE(token_id uuid, role user_role, partner_id uuid, client_id uuid, is_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    access_tokens.role,
    access_tokens.partner_id,
    access_tokens.client_id,
    (is_active = true AND (expires_at IS NULL OR expires_at > NOW()))::boolean
  FROM access_tokens
  WHERE code = UPPER(_code)
  LIMIT 1;
  
  -- Update last_used_at and extend expires_at by 12 months
  UPDATE access_tokens
  SET 
    last_used_at = NOW(),
    expires_at = NOW() + interval '12 months'
  WHERE code = UPPER(_code);
END;
$function$;