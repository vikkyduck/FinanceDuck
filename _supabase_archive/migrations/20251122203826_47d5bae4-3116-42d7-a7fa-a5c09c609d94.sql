-- Системный фикс: скрыть счета с hidden_from_assistant = true от ассистентов
-- Пересоздаём функцию get_invoices_for_user с правильной фильтрацией

CREATE OR REPLACE FUNCTION get_invoices_for_user(
  _token_id UUID,
  _partner_id UUID DEFAULT NULL,
  _client_id UUID DEFAULT NULL
)
RETURNS TABLE (
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
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  _role user_role;
  _associated_partner_id UUID;
  _associated_client_id UUID;
BEGIN
  -- Получаем роль токена
  SELECT role, partner_id, client_id
  INTO _role, _associated_partner_id, _associated_client_id
  FROM access_tokens
  WHERE access_tokens.id = _token_id AND is_active = true;

  IF _role IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive token';
  END IF;

  -- Админы и ассистенты видят все счета (но ассистенты НЕ видят скрытые)
  IF _role IN ('admin', 'assistant') THEN
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
      -- КРИТИЧЕСКИ ВАЖНЫЙ ФИЛЬТР: ассистенты НЕ видят скрытые счета
      (_role = 'admin' OR (_role = 'assistant' AND i.hidden_from_assistant = false))
    ORDER BY i.created_at DESC;
    RETURN;
  END IF;

  -- Партнёры видят только свои счета
  IF _role = 'partner' THEN
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
    WHERE i.partner_id = COALESCE(_partner_id, _associated_partner_id)
    ORDER BY i.created_at DESC;
    RETURN;
  END IF;

  -- Клиенты видят только свои счета
  IF _role = 'client' THEN
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
    WHERE i.client_id = COALESCE(_client_id, _associated_client_id)
    ORDER BY i.created_at DESC;
    RETURN;
  END IF;

  -- Если роль не распознана
  RAISE EXCEPTION 'Unknown role: %', _role;
END;
$$;