-- =====================================================
-- RPC Functions for Partner Management
-- =====================================================

-- List all partners (admin/assistant only)
CREATE OR REPLACE FUNCTION public.manage_partners_list(_token_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check authorization
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to list partners';
  END IF;

  -- Return partners ordered by name
  RETURN QUERY
  SELECT p.id, p.name, p.email, p.phone, p.created_at, p.updated_at
  FROM partners p
  ORDER BY p.name;
END;
$$;

-- Add a new partner (admin/assistant only)
CREATE OR REPLACE FUNCTION public.manage_partners_add(
  _token_id uuid,
  _name text,
  _email text,
  _phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  -- Check authorization
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to add partners';
  END IF;

  -- Validate inputs
  IF _name IS NULL OR trim(_name) = '' THEN
    RAISE EXCEPTION 'Partner name is required';
  END IF;

  IF _email IS NULL OR trim(_email) = '' THEN
    RAISE EXCEPTION 'Partner email is required';
  END IF;

  -- Insert partner
  INSERT INTO partners (name, email, phone)
  VALUES (trim(_name), trim(_email), NULLIF(trim(_phone), ''))
  RETURNING id INTO v_partner_id;

  RETURN v_partner_id;
END;
$$;

-- Delete a partner (admin/assistant only)
CREATE OR REPLACE FUNCTION public.manage_partners_delete(
  _token_id uuid,
  _partner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_count int;
  v_invoice_count int;
BEGIN
  -- Check authorization
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to delete partners';
  END IF;

  -- Check for related clients
  SELECT COUNT(*) INTO v_client_count
  FROM clients
  WHERE partner_id = _partner_id;

  IF v_client_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'cannot_delete_has_clients',
      'message', format('Невозможно удалить партнёра. У него есть %s клиентов. Сначала переназначьте или удалите клиентов.', v_client_count)
    );
  END IF;

  -- Check for related invoices
  SELECT COUNT(*) INTO v_invoice_count
  FROM invoices
  WHERE partner_id = _partner_id;

  IF v_invoice_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'cannot_delete_has_invoices',
      'message', format('Невозможно удалить партнёра. У него есть %s счетов.', v_invoice_count)
    );
  END IF;

  -- Delete partner
  DELETE FROM partners WHERE id = _partner_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- =====================================================
-- RPC Functions for Client Management
-- =====================================================

-- List all clients with partner info (admin/assistant only)
CREATE OR REPLACE FUNCTION public.manage_clients_list(_token_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  partner_id uuid,
  partner_name text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check authorization
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to list clients';
  END IF;

  -- Return clients with partner info, ordered by name
  RETURN QUERY
  SELECT 
    c.id, 
    c.name, 
    c.email, 
    c.phone, 
    c.partner_id,
    p.name as partner_name,
    c.created_at, 
    c.updated_at
  FROM clients c
  LEFT JOIN partners p ON c.partner_id = p.id
  ORDER BY c.name;
END;
$$;

-- Add a new client (admin/assistant only)
CREATE OR REPLACE FUNCTION public.manage_clients_add(
  _token_id uuid,
  _name text,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _partner_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  -- Check authorization
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to add clients';
  END IF;

  -- Validate inputs
  IF _name IS NULL OR trim(_name) = '' THEN
    RAISE EXCEPTION 'Client name is required';
  END IF;

  -- Verify partner exists if provided
  IF _partner_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM partners WHERE id = _partner_id) THEN
      RAISE EXCEPTION 'Partner not found';
    END IF;
  END IF;

  -- Insert client
  INSERT INTO clients (name, email, phone, partner_id)
  VALUES (
    trim(_name), 
    NULLIF(trim(_email), ''), 
    NULLIF(trim(_phone), ''),
    _partner_id
  )
  RETURNING id INTO v_client_id;

  RETURN v_client_id;
END;
$$;

-- Delete a client (admin/assistant only)
CREATE OR REPLACE FUNCTION public.manage_clients_delete(
  _token_id uuid,
  _client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_count int;
BEGIN
  -- Check authorization
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to delete clients';
  END IF;

  -- Check for related invoices
  SELECT COUNT(*) INTO v_invoice_count
  FROM invoices
  WHERE client_id = _client_id;

  IF v_invoice_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'cannot_delete_has_invoices',
      'message', format('Невозможно удалить клиента. У него есть %s счетов.', v_invoice_count)
    );
  END IF;

  -- Delete client
  DELETE FROM clients WHERE id = _client_id;

  RETURN jsonb_build_object('success', true);
END;
$$;