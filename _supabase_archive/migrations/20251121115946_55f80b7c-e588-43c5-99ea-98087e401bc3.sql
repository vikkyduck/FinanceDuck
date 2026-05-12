-- Create many-to-many relationship table between clients and partners
CREATE TABLE IF NOT EXISTS public.client_partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, partner_id)
);

-- Enable RLS on client_partners
ALTER TABLE public.client_partners ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_partners
CREATE POLICY "Admins can manage client_partners" ON public.client_partners
  FOR ALL USING (is_admin(get_session_token_id()));

CREATE POLICY "Assistants can manage client_partners" ON public.client_partners
  FOR ALL USING (is_assistant(get_session_token_id()));

CREATE POLICY "Partners can view their client relationships" ON public.client_partners
  FOR SELECT USING (partner_id = get_token_partner_id(get_session_token_id()));

CREATE POLICY "Clients can view their partner relationships" ON public.client_partners
  FOR SELECT USING (client_id = get_token_client_id(get_session_token_id()));

CREATE POLICY "Block anonymous access to client_partners" ON public.client_partners
  FOR ALL USING (false);

-- Migrate existing client->partner relationships to new table
INSERT INTO public.client_partners (client_id, partner_id)
SELECT id, partner_id 
FROM public.clients 
WHERE partner_id IS NOT NULL
ON CONFLICT (client_id, partner_id) DO NOTHING;

-- Drop the RLS policy that depends on partner_id
DROP POLICY IF EXISTS "Partners can view their clients" ON public.clients;

-- Drop the old partner_id column from clients
ALTER TABLE public.clients DROP COLUMN IF EXISTS partner_id;

-- Create new RLS policy for partners to view their clients through client_partners
CREATE POLICY "Partners can view their clients" ON public.clients
  FOR SELECT USING (
    id IN (
      SELECT client_id 
      FROM client_partners 
      WHERE partner_id = get_token_partner_id(get_session_token_id())
    )
  );

-- Drop old functions
DROP FUNCTION IF EXISTS public.manage_clients_add(uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.manage_clients_list(uuid);

-- Create new manage_clients_add function to support multiple partners
CREATE FUNCTION public.manage_clients_add(
  _token_id uuid, 
  _name text, 
  _telegram text DEFAULT NULL::text, 
  _phone text DEFAULT NULL::text, 
  _partner_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_id uuid;
  v_partner_id uuid;
BEGIN
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to add clients';
  END IF;

  IF _name IS NULL OR trim(_name) = '' THEN
    RAISE EXCEPTION 'Client name is required';
  END IF;

  -- Insert client
  INSERT INTO clients (name, telegram, phone)
  VALUES (
    trim(_name), 
    NULLIF(trim(_telegram), ''), 
    NULLIF(trim(_phone), '')
  )
  RETURNING id INTO v_client_id;

  -- Insert partner relationships
  IF _partner_ids IS NOT NULL THEN
    FOREACH v_partner_id IN ARRAY _partner_ids
    LOOP
      IF EXISTS (SELECT 1 FROM partners WHERE id = v_partner_id) THEN
        INSERT INTO client_partners (client_id, partner_id)
        VALUES (v_client_id, v_partner_id)
        ON CONFLICT (client_id, partner_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_client_id;
END;
$$;

-- Create new manage_clients_list function to return partner relationships
CREATE FUNCTION public.manage_clients_list(_token_id uuid)
RETURNS TABLE(
  id uuid, 
  name text, 
  telegram text, 
  phone text, 
  partner_ids uuid[],
  partner_names text[],
  created_at timestamp with time zone, 
  updated_at timestamp with time zone
)
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
    COALESCE(array_agg(cp.partner_id) FILTER (WHERE cp.partner_id IS NOT NULL), '{}') as partner_ids,
    COALESCE(array_agg(p.name) FILTER (WHERE p.name IS NOT NULL), '{}') as partner_names,
    c.created_at, 
    c.updated_at
  FROM clients c
  LEFT JOIN client_partners cp ON c.id = cp.client_id
  LEFT JOIN partners p ON cp.partner_id = p.id
  GROUP BY c.id, c.name, c.telegram, c.phone, c.created_at, c.updated_at
  ORDER BY c.name;
END;
$$;

-- Create function to get partners for a specific client
CREATE FUNCTION public.get_client_partners(_client_id uuid)
RETURNS TABLE(id uuid, name text, telegram text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.telegram, p.phone
  FROM partners p
  INNER JOIN client_partners cp ON p.id = cp.partner_id
  WHERE cp.client_id = _client_id
  ORDER BY p.name;
END;
$$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_client_partners_client_id ON public.client_partners(client_id);
CREATE INDEX IF NOT EXISTS idx_client_partners_partner_id ON public.client_partners(partner_id);