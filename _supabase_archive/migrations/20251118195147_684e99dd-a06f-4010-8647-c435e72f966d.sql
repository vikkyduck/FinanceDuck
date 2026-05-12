-- Phase 3: Audit Trail Functions and Triggers

-- Function to log sensitive operations (generic)
CREATE OR REPLACE FUNCTION public.log_sensitive_operation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_id UUID;
  v_operation TEXT;
  v_details JSONB;
BEGIN
  v_token_id := get_session_token_id();
  
  -- Determine operation type
  IF TG_OP = 'INSERT' THEN
    v_operation := 'created';
    v_details := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', 'INSERT',
      'new_data', row_to_json(NEW)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_operation := 'updated';
    v_details := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', 'UPDATE',
      'old_data', row_to_json(OLD),
      'new_data', row_to_json(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'deleted';
    v_details := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', 'DELETE',
      'old_data', row_to_json(OLD)
    );
  END IF;
  
  -- Log to security events
  INSERT INTO security_events (
    event_type,
    severity,
    token_id,
    details
  ) VALUES (
    'admin_action',
    CASE WHEN TG_OP = 'DELETE' THEN 'medium'::security_severity ELSE 'low'::security_severity END,
    v_token_id,
    v_details
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Function to detect bulk operations
CREATE OR REPLACE FUNCTION public.detect_bulk_operation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_id UUID;
  v_recent_count INTEGER;
BEGIN
  v_token_id := get_session_token_id();
  
  -- Count operations by this token in last 10 seconds
  SELECT COUNT(*) INTO v_recent_count
  FROM security_events
  WHERE token_id = v_token_id
    AND event_type = 'admin_action'
    AND details->>'table' = TG_TABLE_NAME
    AND created_at > NOW() - INTERVAL '10 seconds';
  
  -- If more than 5 operations in 10 seconds, log as bulk operation
  IF v_recent_count >= 5 THEN
    INSERT INTO security_events (
      event_type,
      severity,
      token_id,
      details
    ) VALUES (
      'bulk_operation',
      'medium',
      v_token_id,
      jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation_count', v_recent_count + 1,
        'time_window', '10 seconds'
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply audit triggers to sensitive tables
CREATE TRIGGER audit_invoices_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION log_sensitive_operation();

CREATE TRIGGER audit_access_tokens_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.access_tokens
  FOR EACH ROW
  EXECUTE FUNCTION log_sensitive_operation();

CREATE TRIGGER audit_partners_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION log_sensitive_operation();

CREATE TRIGGER audit_clients_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION log_sensitive_operation();

CREATE TRIGGER audit_partner_payments_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_payments
  FOR EACH ROW
  EXECUTE FUNCTION log_sensitive_operation();

-- Bulk operation detection triggers
CREATE TRIGGER detect_bulk_invoices
  AFTER DELETE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION detect_bulk_operation();

-- Function to log data exports
CREATE OR REPLACE FUNCTION public.log_data_export(
  _export_type TEXT,
  _record_count INTEGER,
  _token_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO security_events (
    event_type,
    severity,
    token_id,
    details
  ) VALUES (
    'data_export',
    'medium',
    COALESCE(_token_id, get_session_token_id()),
    jsonb_build_object(
      'export_type', _export_type,
      'record_count', _record_count,
      'timestamp', NOW()
    )
  );
END;
$$;

-- Function to resolve security events
CREATE OR REPLACE FUNCTION public.resolve_security_event(
  _event_id UUID,
  _resolved_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE security_events
  SET 
    resolved = true,
    resolved_at = NOW(),
    resolved_by = COALESCE(_resolved_by, get_session_token_id())
  WHERE id = _event_id;
END;
$$;