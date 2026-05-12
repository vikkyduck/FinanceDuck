-- Удаляем все функции полностью
DROP FUNCTION IF EXISTS public.manage_partners_add(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.manage_partners_list(uuid);
DROP FUNCTION IF EXISTS public.manage_clients_add(uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.manage_clients_list(uuid);

-- Заменяем email на telegram для partners
ALTER TABLE partners DROP COLUMN IF EXISTS email;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS telegram TEXT;

-- Заменяем email на telegram для clients
ALTER TABLE clients DROP COLUMN IF EXISTS email;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram TEXT;

-- Создаем новую функцию manage_partners_add
CREATE FUNCTION public.manage_partners_add(_token_id uuid, _name text, _telegram text, _phone text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  INSERT INTO partners (name, telegram, phone)
  VALUES (trim(_name), NULLIF(trim(_telegram), ''), NULLIF(trim(_phone), ''))
  RETURNING id INTO v_partner_id;

  RETURN v_partner_id;
END;
$$;

-- Создаем новую функцию manage_partners_list
CREATE FUNCTION public.manage_partners_list(_token_id uuid)
RETURNS TABLE(id uuid, name text, telegram text, phone text, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to list partners';
  END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.telegram, p.phone, p.created_at, p.updated_at
  FROM partners p
  ORDER BY p.name;
END;
$$;

-- Создаем новую функцию manage_clients_add
CREATE FUNCTION public.manage_clients_add(_token_id uuid, _name text, _telegram text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _partner_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  INSERT INTO clients (name, telegram, phone, partner_id)
  VALUES (
    trim(_name), 
    NULLIF(trim(_telegram), ''), 
    NULLIF(trim(_phone), ''),
    _partner_id
  )
  RETURNING id INTO v_client_id;

  RETURN v_client_id;
END;
$$;

-- Создаем новую функцию manage_clients_list
CREATE FUNCTION public.manage_clients_list(_token_id uuid)
RETURNS TABLE(id uuid, name text, telegram text, phone text, partner_id uuid, partner_name text, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to list clients';
  END IF;

  RETURN QUERY
  SELECT 
    c.id, 
    c.name, 
    c.telegram, 
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