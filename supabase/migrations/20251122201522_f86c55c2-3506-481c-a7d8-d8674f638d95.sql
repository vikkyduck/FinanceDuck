
-- Create RPC function for creating invoices with proper session context
CREATE OR REPLACE FUNCTION public.create_invoice_with_context(
  _token_id UUID,
  _invoice_number TEXT,
  _client_id UUID,
  _partner_id UUID,
  _scheme invoice_scheme,
  _partner_commission_rate NUMERIC DEFAULT NULL,
  _status invoice_status DEFAULT 'draft',
  _notes TEXT DEFAULT NULL,
  _payment_date DATE DEFAULT NULL,
  _hidden_from_assistant BOOLEAN DEFAULT FALSE,
  _calculations JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  invoice_id UUID,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
  v_user_role user_role;
BEGIN
  -- Set session context for this transaction
  PERFORM set_session_context(_token_id);
  
  -- Get user role
  SELECT role INTO v_user_role FROM access_tokens WHERE id = _token_id AND is_active = true;
  
  IF v_user_role IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'Invalid or inactive token';
    RETURN;
  END IF;
  
  -- Check permissions (admin or assistant can create invoices)
  IF v_user_role NOT IN ('admin', 'assistant') THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'У вас нет прав для создания счетов';
    RETURN;
  END IF;
  
  -- Insert invoice
  INSERT INTO invoices (
    invoice_number,
    client_id,
    partner_id,
    scheme,
    partner_commission_rate,
    status,
    created_by,
    notes,
    payment_date,
    hidden_from_assistant
  ) VALUES (
    _invoice_number,
    _client_id,
    _partner_id,
    _scheme,
    _partner_commission_rate,
    _status,
    _token_id,
    _notes,
    _payment_date,
    _hidden_from_assistant
  )
  RETURNING id INTO v_invoice_id;
  
  -- Insert calculations if provided
  IF _calculations != '{}'::jsonb THEN
    INSERT INTO invoice_calculations (
      invoice_id,
      client_bill,
      commission_rate,
      commission_amount,
      amount_to_admin,
      agency_margin,
      partner_share_from_margin,
      admin_share_from_margin,
      client_base_after_margin,
      client_spent,
      client_remaining,
      executor_expenses_total,
      net_profit_admin,
      admin_share_50,
      cat_share_50
    ) VALUES (
      v_invoice_id,
      (_calculations->>'client_bill')::numeric,
      (_calculations->>'commission_rate')::numeric,
      (_calculations->>'commission_amount')::numeric,
      (_calculations->>'amount_to_admin')::numeric,
      (_calculations->>'agency_margin')::numeric,
      (_calculations->>'partner_share_from_margin')::numeric,
      (_calculations->>'admin_share_from_margin')::numeric,
      (_calculations->>'client_base_after_margin')::numeric,
      (_calculations->>'client_spent')::numeric,
      (_calculations->>'client_remaining')::numeric,
      (_calculations->>'executor_expenses_total')::numeric,
      (_calculations->>'net_profit_admin')::numeric,
      (_calculations->>'admin_share_50')::numeric,
      (_calculations->>'cat_share_50')::numeric
    );
  END IF;
  
  RETURN QUERY SELECT v_invoice_id, TRUE, 'Счет успешно создан';
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_invoice_with_context TO authenticated, anon;
