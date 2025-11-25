-- Drop existing functions first
DROP FUNCTION IF EXISTS public.get_invoices_for_user(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.get_invoice_details(uuid, uuid);

-- Recreate get_invoices_for_user without approval columns
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
    ic.client_bill,
    ic.executor_expenses_total,
    CASE
      WHEN v_user_role = 'admin' THEN ic.client_spent
      WHEN v_user_role = 'assistant' THEN ic.client_spent
      WHEN v_user_role = 'partner' THEN ic.client_spent
      WHEN v_user_role = 'client' AND i.scheme = 'agency_30' THEN ic.client_spent
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
    CASE
      WHEN v_user_role = 'admin' THEN ic.assistant_bonus_total
      WHEN v_user_role = 'assistant' THEN ic.assistant_bonus_total
      ELSE NULL
    END as assistant_bonus_total
  FROM invoices i
  LEFT JOIN clients c ON i.client_id = c.id
  LEFT JOIN partners p ON i.partner_id = p.id
  LEFT JOIN invoice_calculations ic ON ic.invoice_id = i.id
  WHERE
    (v_user_role = 'admin') OR
    (v_user_role = 'assistant' AND i.hidden_from_assistant = false) OR
    (v_user_role = 'partner' AND i.partner_id = v_token_partner_id) OR
    (v_user_role = 'client' AND i.client_id = v_token_client_id)
  ORDER BY i.created_at DESC;
END;
$function$;

-- Recreate get_invoice_details without approval columns
CREATE OR REPLACE FUNCTION public.get_invoice_details(_token_id uuid, _invoice_id uuid)
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
   client_telegram text, 
   client_phone text, 
   partner_name text, 
   partner_telegram text, 
   partner_phone text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_session_context(_token_id);
  
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
    c.telegram as client_telegram,
    c.phone as client_phone,
    p.name as partner_name,
    p.telegram as partner_telegram,
    p.phone as partner_phone
  FROM invoices i
  LEFT JOIN clients c ON i.client_id = c.id
  LEFT JOIN partners p ON i.partner_id = p.id
  WHERE i.id = _invoice_id
  LIMIT 1;
END;
$function$;