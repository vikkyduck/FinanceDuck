-- ИНСТРУКЦИЯ: Скопируйте весь этот SQL и выполните в Supabase Dashboard -> SQL Editor
-- Это исправит проблему с нулевыми суммами в счетах

-- Шаг 1: Добавляем колонку client_bill в таблицу invoices
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS client_bill NUMERIC(15, 2) DEFAULT 0;

-- Шаг 2: Копируем существующие значения из invoice_calculations
UPDATE invoices i
SET client_bill = ic.client_bill
FROM invoice_calculations ic
WHERE ic.invoice_id = i.id 
  AND ic.client_bill IS NOT NULL 
  AND ic.client_bill > 0
  AND (i.client_bill IS NULL OR i.client_bill = 0);

-- Шаг 3: Обновляем функцию recalculate_all_invoices
DROP FUNCTION IF EXISTS public.recalculate_all_invoices(uuid);

CREATE OR REPLACE FUNCTION public.recalculate_all_invoices(_invoice_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER := 0;
  v_created INTEGER := 0;
  v_invoice RECORD;
  v_client_bill NUMERIC;
  v_scheme invoice_scheme;
  v_commission_rate NUMERIC;
  v_total_expenses NUMERIC;
  v_existing_calc BOOLEAN;
  v_commission_amount NUMERIC;
  v_amount_to_admin NUMERIC;
  v_net_profit_admin NUMERIC;
  v_agency_margin NUMERIC;
  v_partner_share NUMERIC;
  v_admin_share NUMERIC;
  v_client_base NUMERIC;
  v_client_remaining NUMERIC;
  v_admin_share_50 NUMERIC;
  v_cat_share_50 NUMERIC;
BEGIN
  FOR v_invoice IN
    SELECT 
      i.id, 
      i.scheme, 
      i.partner_commission_rate,
      COALESCE(ic.client_bill, i.client_bill, 0) as client_bill,
      (ic.invoice_id IS NOT NULL) as has_calculation
    FROM invoices i
    LEFT JOIN invoice_calculations ic ON ic.invoice_id = i.id
    WHERE (_invoice_id IS NULL OR i.id = _invoice_id)
  LOOP
    v_client_bill := v_invoice.client_bill;
    v_scheme := v_invoice.scheme;
    v_commission_rate := COALESCE(v_invoice.partner_commission_rate, 10);
    v_existing_calc := v_invoice.has_calculation;
    
    SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
    FROM executor_expenses
    WHERE invoice_id = v_invoice.id;
    
    IF v_scheme = 'commission_based' THEN
      v_commission_amount := v_client_bill * (v_commission_rate / 100.0);
      v_amount_to_admin := v_client_bill - v_commission_amount;
      v_net_profit_admin := v_amount_to_admin - v_total_expenses;
      v_admin_share_50 := v_net_profit_admin / 2.0;
      v_cat_share_50 := v_net_profit_admin / 2.0;
      
      IF v_existing_calc THEN
        UPDATE invoice_calculations
        SET
          client_bill = v_client_bill,
          commission_rate = v_commission_rate,
          commission_amount = v_commission_amount,
          amount_to_admin = v_amount_to_admin,
          executor_expenses_total = v_total_expenses,
          client_spent = v_total_expenses,
          net_profit_admin = v_net_profit_admin,
          admin_share_50 = v_admin_share_50,
          cat_share_50 = v_cat_share_50,
          updated_at = now()
        WHERE invoice_id = v_invoice.id;
      ELSE
        INSERT INTO invoice_calculations (
          invoice_id, client_bill, commission_rate, commission_amount,
          amount_to_admin, executor_expenses_total, client_spent,
          net_profit_admin, admin_share_50, cat_share_50
        ) VALUES (
          v_invoice.id, v_client_bill, v_commission_rate, v_commission_amount,
          v_amount_to_admin, v_total_expenses, v_total_expenses,
          v_net_profit_admin, v_admin_share_50, v_cat_share_50
        );
        v_created := v_created + 1;
      END IF;
      
    ELSIF v_scheme = 'agency_30' THEN
      v_agency_margin := v_client_bill * 0.30;
      v_partner_share := v_client_bill * 0.15;
      v_admin_share := v_client_bill * 0.15;
      v_client_base := v_client_bill * 0.70;
      v_client_remaining := v_client_base - v_total_expenses;
      v_admin_share_50 := v_admin_share / 2.0;
      v_cat_share_50 := v_admin_share / 2.0;
      
      IF v_existing_calc THEN
        UPDATE invoice_calculations
        SET
          client_bill = v_client_bill,
          agency_margin = v_agency_margin,
          partner_share_from_margin = v_partner_share,
          admin_share_from_margin = v_admin_share,
          client_base_after_margin = v_client_base,
          executor_expenses_total = v_total_expenses,
          client_spent = v_total_expenses,
          client_remaining = v_client_remaining,
          net_profit_admin = v_admin_share,
          admin_share_50 = v_admin_share_50,
          cat_share_50 = v_cat_share_50,
          updated_at = now()
        WHERE invoice_id = v_invoice.id;
      ELSE
        INSERT INTO invoice_calculations (
          invoice_id, client_bill, agency_margin, partner_share_from_margin,
          admin_share_from_margin, client_base_after_margin, executor_expenses_total,
          client_spent, client_remaining, net_profit_admin, admin_share_50, cat_share_50
        ) VALUES (
          v_invoice.id, v_client_bill, v_agency_margin, v_partner_share,
          v_admin_share, v_client_base, v_total_expenses,
          v_total_expenses, v_client_remaining, v_admin_share, v_admin_share_50, v_cat_share_50
        );
        v_created := v_created + 1;
      END IF;
    END IF;
    
    UPDATE invoices SET client_bill = v_client_bill WHERE id = v_invoice.id AND client_bill != v_client_bill;
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'recalculated_count', v_count,
    'created_count', v_created,
    'message', CASE 
      WHEN v_count = 0 THEN 'Нет счетов для пересчёта'
      ELSE 'Пересчитано: ' || v_count::TEXT || ', создано записей: ' || v_created::TEXT
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_all_invoices(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_invoices(uuid) TO service_role;

-- Шаг 4: Обновляем функцию get_invoices_for_user
DROP FUNCTION IF EXISTS public.get_invoices_for_user(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_invoices_for_user(_token_id uuid, _partner_id uuid DEFAULT NULL::uuid, _client_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(
   id uuid, 
   invoice_number text, 
   client_id uuid, 
   partner_id uuid, 
   scheme invoice_scheme, 
   status invoice_status, 
   payment_date date, 
   actual_payment_date date, 
   notes text, 
   partner_commission_rate numeric, 
   hidden_from_assistant boolean, 
   priority_level text, 
   created_by uuid, 
   created_at timestamp with time zone, 
   updated_at timestamp with time zone, 
   client_name text, 
   partner_name text, 
   client_bill numeric, 
   executor_expenses_total numeric, 
   client_spent numeric, 
   client_base_after_margin numeric, 
   client_remaining numeric, 
   agency_margin numeric, 
   partner_share_from_margin numeric, 
   admin_share_from_margin numeric, 
   commission_rate numeric, 
   commission_amount numeric, 
   amount_to_admin numeric, 
   net_profit_admin numeric, 
   admin_share_50 numeric, 
   cat_share_50 numeric, 
   assistant_bonus_total numeric
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role user_role;
  v_token_partner_id uuid;
  v_token_client_id uuid;
BEGIN
  PERFORM set_session_context(_token_id);
  
  SELECT role, access_tokens.partner_id, access_tokens.client_id
  INTO v_user_role, v_token_partner_id, v_token_client_id
  FROM access_tokens
  WHERE access_tokens.id = _token_id AND is_active = true;
  
  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive token';
  END IF;
  
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
    i.priority_level,
    i.created_by,
    i.created_at,
    i.updated_at,
    c.name as client_name,
    p.name as partner_name,
    COALESCE(ic.client_bill, i.client_bill) as client_bill,
    COALESCE(ic.executor_expenses_total, 0) as executor_expenses_total,
    CASE
      WHEN v_user_role = 'admin' THEN COALESCE(ic.client_spent, 0)
      WHEN v_user_role = 'assistant' THEN COALESCE(ic.client_spent, 0)
      WHEN v_user_role = 'partner' THEN COALESCE(ic.client_spent, 0)
      WHEN v_user_role = 'client' AND i.scheme = 'agency_30' THEN COALESCE(ic.client_spent, 0)
      ELSE NULL
    END as client_spent,
    CASE
      WHEN v_user_role = 'admin' THEN ic.client_base_after_margin
      WHEN v_user_role = 'partner' THEN ic.client_base_after_margin
      ELSE NULL
    END as client_base_after_margin,
    CASE
      WHEN v_user_role = 'admin' THEN ic.client_remaining
      WHEN v_user_role = 'assistant' AND i.scheme = 'agency_30' THEN ic.client_remaining
      WHEN v_user_role = 'partner' THEN ic.client_remaining
      WHEN v_user_role = 'client' AND i.scheme = 'agency_30' THEN ic.client_remaining
      ELSE NULL
    END as client_remaining,
    CASE
      WHEN v_user_role = 'admin' THEN ic.agency_margin
      WHEN v_user_role = 'assistant' AND i.scheme = 'agency_30' THEN ic.agency_margin
      WHEN v_user_role = 'partner' THEN ic.agency_margin
      WHEN v_user_role = 'client' AND i.scheme = 'agency_30' THEN ic.agency_margin
      ELSE NULL
    END as agency_margin,
    CASE
      WHEN v_user_role = 'admin' THEN ic.partner_share_from_margin
      WHEN v_user_role = 'partner' THEN ic.partner_share_from_margin
      ELSE NULL
    END as partner_share_from_margin,
    CASE
      WHEN v_user_role = 'admin' THEN ic.admin_share_from_margin
      ELSE NULL
    END as admin_share_from_margin,
    CASE
      WHEN v_user_role = 'admin' THEN ic.commission_rate
      WHEN v_user_role = 'partner' THEN ic.commission_rate
      ELSE NULL
    END as commission_rate,
    CASE
      WHEN v_user_role = 'admin' THEN ic.commission_amount
      WHEN v_user_role = 'partner' THEN ic.commission_amount
      ELSE NULL
    END as commission_amount,
    CASE
      WHEN v_user_role = 'admin' THEN ic.amount_to_admin
      ELSE NULL
    END as amount_to_admin,
    CASE
      WHEN v_user_role = 'admin' THEN ic.net_profit_admin
      ELSE NULL
    END as net_profit_admin,
    CASE
      WHEN v_user_role = 'admin' THEN ic.admin_share_50
      ELSE NULL
    END as admin_share_50,
    CASE
      WHEN v_user_role = 'admin' THEN ic.cat_share_50
      ELSE NULL
    END as cat_share_50,
    COALESCE((SELECT SUM(ab.amount) FROM assistant_bonuses ab WHERE ab.invoice_id = i.id), 0) as assistant_bonus_total
  FROM invoices i
  LEFT JOIN clients c ON c.id = i.client_id
  LEFT JOIN partners p ON p.id = i.partner_id
  LEFT JOIN invoice_calculations ic ON ic.invoice_id = i.id
  WHERE
    CASE
      WHEN v_user_role = 'admin' THEN true
      WHEN v_user_role = 'assistant' THEN NOT COALESCE(i.hidden_from_assistant, false)
      WHEN v_user_role = 'partner' THEN 
        i.partner_id = COALESCE(_partner_id, v_token_partner_id)
      WHEN v_user_role = 'client' THEN 
        i.client_id = COALESCE(_client_id, v_token_client_id)
      ELSE false
    END
  ORDER BY i.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_invoices_for_user(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoices_for_user(uuid, uuid, uuid) TO service_role;

-- Шаг 5: Обновляем функцию create_invoice_with_context чтобы сохранять client_bill в обе таблицы
DROP FUNCTION IF EXISTS public.create_invoice_with_context(uuid, text, uuid, uuid, invoice_scheme, numeric, invoice_status, text, date, boolean, jsonb);

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
  v_client_bill NUMERIC;
BEGIN
  PERFORM set_session_context(_token_id);
  
  SELECT role INTO v_user_role FROM access_tokens WHERE id = _token_id AND is_active = true;
  
  IF v_user_role IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'Invalid or inactive token';
    RETURN;
  END IF;
  
  IF v_user_role NOT IN ('admin', 'assistant') THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'У вас нет прав для создания счетов';
    RETURN;
  END IF;
  
  v_client_bill := COALESCE((_calculations->>'client_bill')::numeric, 0);
  
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
    hidden_from_assistant,
    client_bill
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
    _hidden_from_assistant,
    v_client_bill
  )
  RETURNING id INTO v_invoice_id;
  
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
      v_client_bill,
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

GRANT EXECUTE ON FUNCTION public.create_invoice_with_context TO authenticated, anon;

-- Готово! После выполнения этого SQL обновите страницу в приложении
