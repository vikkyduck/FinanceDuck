-- Fix manage_partners_delete function to use client_partners table
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

  -- Count clients for this partner through client_partners table
  SELECT COUNT(DISTINCT client_id) INTO v_client_count
  FROM client_partners
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

  -- Delete client_partners relationships for this partner
  DELETE FROM client_partners WHERE partner_id = _partner_id;

  -- Delete the partner
  DELETE FROM partners WHERE id = _partner_id;

  RETURN jsonb_build_object('success', true);
END;
$$;