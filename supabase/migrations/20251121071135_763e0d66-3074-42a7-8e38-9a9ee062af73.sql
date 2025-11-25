-- Fix 1: Update delete functions to allow deletion when only draft/cancelled invoices exist
CREATE OR REPLACE FUNCTION public.manage_clients_delete(_token_id uuid, _client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_active_invoice_count int;
BEGIN
  -- Authorization: only admin or assistant tokens may delete clients
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

  -- Count ACTIVE invoices (sent or paid) for this client
  SELECT COUNT(*) INTO v_active_invoice_count
  FROM invoices
  WHERE client_id = _client_id
    AND status IN ('sent', 'paid');

  IF v_active_invoice_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'cannot_delete_has_active_invoices',
      'message', format('Невозможно удалить клиента. У него есть %s активных счетов (отправленных или оплаченных). Сначала отмените или удалите эти счета.', v_active_invoice_count)
    );
  END IF;

  -- Delete all draft/cancelled invoices for this client
  DELETE FROM invoices WHERE client_id = _client_id AND status IN ('draft', 'cancelled');

  -- Delete the client
  DELETE FROM clients WHERE id = _client_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_partners_delete(_token_id uuid, _partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_count int;
  v_active_invoice_count int;
BEGIN
  -- Authorization: only admin or assistant tokens may delete partners
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

  -- Count ACTIVE invoices (sent or paid) for this partner
  SELECT COUNT(*) INTO v_active_invoice_count
  FROM invoices
  WHERE partner_id = _partner_id
    AND status IN ('sent', 'paid');

  IF v_active_invoice_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'cannot_delete_has_active_invoices',
      'message', format('Невозможно удалить партнёра. У него есть %s активных счетов (отправленных или оплаченных). Сначала отмените или удалите эти счета.', v_active_invoice_count)
    );
  END IF;

  -- Delete all draft/cancelled invoices for this partner
  DELETE FROM invoices WHERE partner_id = _partner_id AND status IN ('draft', 'cancelled');

  -- Delete the partner
  DELETE FROM partners WHERE id = _partner_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Fix 2: Set up automatic session cleanup using pg_cron
-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup to run every day at 3 AM
SELECT cron.schedule(
  'cleanup-expired-sessions',
  '0 3 * * *',
  $$SELECT cleanup_expired_sessions();$$
);

COMMENT ON EXTENSION pg_cron IS 'Automatic cleanup of expired sessions runs daily at 3 AM';
