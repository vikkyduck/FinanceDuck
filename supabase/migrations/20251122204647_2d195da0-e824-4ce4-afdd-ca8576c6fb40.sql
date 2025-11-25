-- Fix ambiguous column reference in get_invoices_for_user
-- Add explicit table aliases to all column references

CREATE OR REPLACE FUNCTION public.get_invoices_for_user(
  _token_id uuid,
  _partner_id uuid DEFAULT NULL,
  _client_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  invoice_number text,
  client_id uuid,
  partner_id uuid,
  scheme invoice_scheme,
  status invoice_status,
  payment_date date,
  actual_payment_date date,
  notes text,
  partner_commission_rate numeric,
  hidden_from_assistant boolean,
  requires_approval boolean,
  approval_notes text,
  approved_by uuid,
  approved_at timestamp with time zone,
  priority_level text,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  client_name text,
  partner_name text,
  client_bill numeric,
  client_remaining numeric,
  executor_expenses_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role user_role;
  _associated_partner_id UUID;
  _associated_client_id UUID;
BEGIN
  -- Get role from token
  SELECT at.role, at.partner_id, at.client_id
  INTO _role, _associated_partner_id, _associated_client_id
  FROM access_tokens at
  WHERE at.id = _token_id AND at.is_active = true;

  IF _role IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive token';
  END IF;

  -- Admins and assistants see all invoices (but assistants DO NOT see hidden ones)
  IF _role IN ('admin', 'assistant') THEN
    RETURN QUERY
    SELECT 
      i.id,
      i.invoice_number,
      i.client_id,
      i.partner_id,
      i.scheme,
      i.status,
      i.payment_date,
      i.actual_payment_date,
      i.notes,
      i.partner_commission_rate,
      i.hidden_from_assistant,
      i.requires_approval,
      i.approval_notes,
      i.approved_by,
      i.approved_at,
      i.priority_level,
      i.created_by,
      i.created_at,
      i.updated_at,
      c.name as client_name,
      p.name as partner_name,
      ic.client_bill,
      ic.client_remaining,
      ic.executor_expenses_total
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    LEFT JOIN partners p ON i.partner_id = p.id
    LEFT JOIN invoice_calculations ic ON i.id = ic.invoice_id
    WHERE 
      -- CRITICAL: assistants DO NOT see hidden invoices
      (_role = 'admin' OR (_role = 'assistant' AND i.hidden_from_assistant = false))
    ORDER BY i.created_at DESC;
    RETURN;
  END IF;

  -- Partners see only their invoices
  IF _role = 'partner' THEN
    RETURN QUERY
    SELECT 
      i.id,
      i.invoice_number,
      i.client_id,
      i.partner_id,
      i.scheme,
      i.status,
      i.payment_date,
      i.actual_payment_date,
      i.notes,
      i.partner_commission_rate,
      i.hidden_from_assistant,
      i.requires_approval,
      i.approval_notes,
      i.approved_by,
      i.approved_at,
      i.priority_level,
      i.created_by,
      i.created_at,
      i.updated_at,
      c.name as client_name,
      p.name as partner_name,
      ic.client_bill,
      ic.client_remaining,
      ic.executor_expenses_total
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    LEFT JOIN partners p ON i.partner_id = p.id
    LEFT JOIN invoice_calculations ic ON i.id = ic.invoice_id
    WHERE i.partner_id = _associated_partner_id
      OR (_partner_id IS NOT NULL AND i.partner_id = _partner_id)
    ORDER BY i.created_at DESC;
    RETURN;
  END IF;

  -- Clients see only their invoices
  IF _role = 'client' THEN
    RETURN QUERY
    SELECT 
      i.id,
      i.invoice_number,
      i.client_id,
      i.partner_id,
      i.scheme,
      i.status,
      i.payment_date,
      i.actual_payment_date,
      i.notes,
      i.partner_commission_rate,
      i.hidden_from_assistant,
      i.requires_approval,
      i.approval_notes,
      i.approved_by,
      i.approved_at,
      i.priority_level,
      i.created_by,
      i.created_at,
      i.updated_at,
      c.name as client_name,
      p.name as partner_name,
      ic.client_bill,
      ic.client_remaining,
      ic.executor_expenses_total
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    LEFT JOIN partners p ON i.partner_id = p.id
    LEFT JOIN invoice_calculations ic ON i.id = ic.invoice_id
    WHERE i.client_id = _associated_client_id
      OR (_client_id IS NOT NULL AND i.client_id = _client_id)
    ORDER BY i.created_at DESC;
    RETURN;
  END IF;

  -- Default: return nothing
  RETURN;
END;
$$;