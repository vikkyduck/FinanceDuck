-- Drop and recreate manage_clients_update_partners function with fixed SQL
DROP FUNCTION IF EXISTS public.manage_clients_update_partners(uuid, uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.manage_clients_update_partners(_token_id uuid, _client_id uuid, _partner_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  -- Authorization: only admin or assistant tokens may update client partners
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to update client partners';
  END IF;

  -- Check if client exists
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = _client_id) THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  -- Delete existing relationships for this client
  DELETE FROM client_partners WHERE client_id = _client_id;

  -- Insert new relationships
  IF _partner_ids IS NOT NULL AND array_length(_partner_ids, 1) > 0 THEN
    FOREACH v_partner_id IN ARRAY _partner_ids
    LOOP
      -- Check if partner exists before inserting
      IF EXISTS (SELECT 1 FROM partners WHERE id = v_partner_id) THEN
        INSERT INTO client_partners (client_id, partner_id)
        VALUES (_client_id, v_partner_id)
        ON CONFLICT (client_id, partner_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END;
$$;