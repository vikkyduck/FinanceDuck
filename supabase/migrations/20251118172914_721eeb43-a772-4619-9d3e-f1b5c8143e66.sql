-- Fix all security warnings

-- 1. Set token expiration for all tokens (24 hours from creation)
UPDATE access_tokens 
SET expires_at = created_at + interval '24 hours'
WHERE expires_at IS NULL;

-- 2. Change uploaded_by to uploaded_by_token_id in invoice_documents
-- First, add the new column
ALTER TABLE invoice_documents 
ADD COLUMN uploaded_by_token_id uuid REFERENCES access_tokens(id);

-- Migrate existing data: try to find token_id from access code
UPDATE invoice_documents 
SET uploaded_by_token_id = (
  SELECT id FROM access_tokens WHERE code = invoice_documents.uploaded_by
)
WHERE uploaded_by_token_id IS NULL;

-- Drop the old column
ALTER TABLE invoice_documents DROP COLUMN uploaded_by;

-- 3. Fix function search paths - add SET search_path = public to all functions
CREATE OR REPLACE FUNCTION public.set_session_context(_token_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.access_token_id', _token_id::text, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_token_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM access_tokens
    WHERE id = _token_id
    AND role = 'admin'
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assistant(_token_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM access_tokens
    WHERE id = _token_id
    AND role = 'assistant'
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_partner(_token_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM access_tokens
    WHERE id = _token_id
    AND role = 'partner'
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_client(_token_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM access_tokens
    WHERE id = _token_id
    AND role = 'client'
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.get_token_partner_id(_token_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT partner_id FROM access_tokens
  WHERE id = _token_id
  AND role = 'partner'
  AND is_active = true
  AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_token_client_id(_token_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM access_tokens
  WHERE id = _token_id
  AND role = 'client'
  AND is_active = true
  AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.manage_partners_list(_token_id uuid)
RETURNS TABLE(id uuid, name text, email text, phone text, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to list partners';
  END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.email, p.phone, p.created_at, p.updated_at
  FROM partners p
  ORDER BY p.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_partners_add(_token_id uuid, _name text, _email text, _phone text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to add partners';
  END IF;

  IF _name IS NULL OR trim(_name) = '' THEN
    RAISE EXCEPTION 'Partner name is required';
  END IF;

  IF _email IS NULL OR trim(_email) = '' THEN
    RAISE EXCEPTION 'Partner email is required';
  END IF;

  INSERT INTO partners (name, email, phone)
  VALUES (trim(_name), trim(_email), NULLIF(trim(_phone), ''))
  RETURNING id INTO v_partner_id;

  RETURN v_partner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_partners_delete(_token_id uuid, _partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_count int;
  v_invoice_count int;
BEGIN
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to delete partners';
  END IF;

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

  DELETE FROM partners WHERE id = _partner_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_clients_list(_token_id uuid)
RETURNS TABLE(id uuid, name text, email text, phone text, partner_id uuid, partner_name text, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to list clients';
  END IF;

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

CREATE OR REPLACE FUNCTION public.manage_clients_add(_token_id uuid, _name text, _email text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _partner_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to add clients';
  END IF;

  IF _name IS NULL OR trim(_name) = '' THEN
    RAISE EXCEPTION 'Client name is required';
  END IF;

  IF _partner_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM partners WHERE id = _partner_id) THEN
      RAISE EXCEPTION 'Partner not found';
    END IF;
  END IF;

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

CREATE OR REPLACE FUNCTION public.manage_clients_delete(_token_id uuid, _client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_count int;
BEGIN
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to delete clients';
  END IF;

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

  DELETE FROM clients WHERE id = _client_id;

  RETURN jsonb_build_object('success', true);
END;
$$;