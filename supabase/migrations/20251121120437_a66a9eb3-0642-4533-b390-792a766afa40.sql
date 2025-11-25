-- Function to update client-partner relationships
CREATE OR REPLACE FUNCTION public.manage_clients_update_partners(
  _token_id uuid,
  _client_id uuid,
  _partner_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    INSERT INTO client_partners (client_id, partner_id)
    SELECT _client_id, unnest(_partner_ids)
    WHERE EXISTS (SELECT 1 FROM partners WHERE id = unnest(_partner_ids))
    ON CONFLICT (client_id, partner_id) DO NOTHING;
  END IF;
END;
$$;

-- Function to clean up deleted partners from client_partners table
CREATE OR REPLACE FUNCTION public.cleanup_deleted_partners()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete client_partner relationships where partner no longer exists
  DELETE FROM client_partners cp
  WHERE NOT EXISTS (
    SELECT 1 FROM partners p WHERE p.id = cp.partner_id
  );
END;
$$;

-- Run cleanup immediately
SELECT cleanup_deleted_partners();