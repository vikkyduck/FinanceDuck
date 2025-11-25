-- ============================================
-- RPC WRAPPER FUNCTIONS FOR DATA ACCESS
-- Fixes session context persistence issue
-- ============================================

-- Function to get invoices for current user
-- Automatically sets session context and executes query in one transaction
CREATE OR REPLACE FUNCTION get_invoices_for_user(
  _token_id UUID,
  _partner_id UUID DEFAULT NULL,
  _client_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  invoice_number TEXT,
  client_id UUID,
  partner_id UUID,
  scheme invoice_scheme,
  status invoice_status,
  payment_date DATE,
  actual_payment_date DATE,
  notes TEXT,
  partner_commission_rate NUMERIC,
  hidden_from_assistant BOOLEAN,
  requires_approval BOOLEAN,
  approval_notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  priority_level TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  client_name TEXT,
  partner_name TEXT,
  client_bill NUMERIC,
  client_remaining NUMERIC,
  executor_expenses_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set session context first
  PERFORM set_session_context(_token_id);
  
  -- Return invoices with joined data
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
    (_partner_id IS NULL OR i.partner_id = _partner_id)
    AND (_client_id IS NULL OR i.client_id = _client_id)
  ORDER BY i.created_at DESC;
END;
$$;

-- Function to get single invoice details
CREATE OR REPLACE FUNCTION get_invoice_details(
  _token_id UUID,
  _invoice_id UUID
)
RETURNS TABLE(
  id UUID,
  invoice_number TEXT,
  client_id UUID,
  partner_id UUID,
  scheme invoice_scheme,
  status invoice_status,
  payment_date DATE,
  actual_payment_date DATE,
  notes TEXT,
  partner_commission_rate NUMERIC,
  hidden_from_assistant BOOLEAN,
  requires_approval BOOLEAN,
  approval_notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  priority_level TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  client_name TEXT,
  client_telegram TEXT,
  client_phone TEXT,
  partner_name TEXT,
  partner_telegram TEXT,
  partner_phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set session context first
  PERFORM set_session_context(_token_id);
  
  -- Return invoice details with joined data
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
    c.telegram as client_telegram,
    c.phone as client_phone,
    p.name as partner_name,
    p.telegram as partner_telegram,
    p.phone as partner_phone
  FROM invoices i
  LEFT JOIN clients c ON i.client_id = c.id
  LEFT JOIN partners p ON i.partner_id = p.id
  WHERE i.id = _invoice_id
  LIMIT 1;
END;
$$;

-- Function to get clients for current user
CREATE OR REPLACE FUNCTION get_clients_for_user(_token_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  telegram TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_session_context(_token_id);
  
  RETURN QUERY
  SELECT c.id, c.name, c.telegram, c.phone, c.created_at, c.updated_at
  FROM clients c
  ORDER BY c.name;
END;
$$;

-- Function to get partners for current user
CREATE OR REPLACE FUNCTION get_partners_for_user(_token_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  telegram TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_session_context(_token_id);
  
  RETURN QUERY
  SELECT p.id, p.name, p.telegram, p.phone, p.created_at, p.updated_at
  FROM partners p
  ORDER BY p.name;
END;
$$;