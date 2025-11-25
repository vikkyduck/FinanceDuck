-- Fix manage_clients_delete function to properly check for invoices
CREATE OR REPLACE FUNCTION public.manage_clients_delete(_token_id uuid, _client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_count int;
BEGIN
  -- Check authorization
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to delete clients';
  END IF;

  -- Check if client exists
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = _client_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'client_not_found',
      'message', 'Клиент не найден'
    );
  END IF;

  -- Count invoices for this client
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

  -- Delete the client
  DELETE FROM clients WHERE id = _client_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Fix manage_partners_delete function to properly check for clients and invoices
CREATE OR REPLACE FUNCTION public.manage_partners_delete(_token_id uuid, _partner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_count int;
  v_invoice_count int;
BEGIN
  -- Check authorization
  IF NOT (is_admin(_token_id) OR is_assistant(_token_id)) THEN
    RAISE EXCEPTION 'Not authorized to delete partners';
  END IF;

  -- Check if partner exists
  IF NOT EXISTS (SELECT 1 FROM partners WHERE id = _partner_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'partner_not_found',
      'message', 'Партнёр не найден'
    );
  END IF;

  -- Count clients for this partner
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

  -- Count invoices for this partner
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

  -- Delete the partner
  DELETE FROM partners WHERE id = _partner_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;