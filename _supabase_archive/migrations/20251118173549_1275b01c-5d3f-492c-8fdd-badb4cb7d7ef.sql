-- Fix remaining functions without SET search_path

CREATE OR REPLACE FUNCTION public.verify_access_code(_code text)
RETURNS TABLE(token_id uuid, role user_role, partner_id uuid, client_id uuid, is_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    access_tokens.role,
    access_tokens.partner_id,
    access_tokens.client_id,
    (is_active = true AND (expires_at IS NULL OR expires_at > NOW()))::boolean
  FROM access_tokens
  WHERE code = UPPER(_code)
  LIMIT 1;
  
  UPDATE access_tokens
  SET last_used_at = NOW()
  WHERE code = UPPER(_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_session_token_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.access_token_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_invoice_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.invoice_calculations
  SET executor_expenses_total = (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.executor_expenses
    WHERE invoice_id = NEW.invoice_id
  ),
  updated_at = now()
  WHERE invoice_id = NEW.invoice_id;
  
  UPDATE public.invoice_calculations ic
  SET 
    client_remaining = CASE 
      WHEN (SELECT scheme FROM public.invoices WHERE id = ic.invoice_id) = 'agency_30'
      THEN ic.client_base_after_margin - ic.executor_expenses_total
      ELSE NULL
    END,
    net_profit_admin = CASE
      WHEN (SELECT scheme FROM public.invoices WHERE id = ic.invoice_id) = 'agency_30'
      THEN ic.admin_share_from_margin
      ELSE ic.amount_to_admin - ic.executor_expenses_total
    END,
    updated_at = now()
  WHERE invoice_id = NEW.invoice_id;
  
  UPDATE public.invoice_calculations
  SET 
    admin_share_50 = net_profit_admin / 2,
    cat_share_50 = net_profit_admin / 2,
    updated_at = now()
  WHERE invoice_id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_assistant_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.document_type = 'client_act' THEN
      UPDATE public.invoice_calculations
      SET 
        assistant_bonus_client_acts = COALESCE(assistant_bonus_client_acts, 0) + 1,
        assistant_bonus_total = (COALESCE(assistant_bonus_client_acts, 0) + 1) * 2000 
                              + COALESCE(assistant_bonus_executor_receipts, 0) * 1000,
        updated_at = now()
      WHERE invoice_id = NEW.invoice_id;
      
    ELSIF NEW.document_type = 'executor_receipt' THEN
      UPDATE public.invoice_calculations
      SET 
        assistant_bonus_executor_receipts = COALESCE(assistant_bonus_executor_receipts, 0) + 1,
        assistant_bonus_total = COALESCE(assistant_bonus_client_acts, 0) * 2000 
                              + (COALESCE(assistant_bonus_executor_receipts, 0) + 1) * 1000,
        updated_at = now()
      WHERE invoice_id = NEW.invoice_id;
    END IF;
    
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.document_type = 'client_act' THEN
      UPDATE public.invoice_calculations
      SET 
        assistant_bonus_client_acts = GREATEST(COALESCE(assistant_bonus_client_acts, 0) - 1, 0),
        assistant_bonus_total = GREATEST(COALESCE(assistant_bonus_client_acts, 0) - 1, 0) * 2000 
                              + COALESCE(assistant_bonus_executor_receipts, 0) * 1000,
        updated_at = now()
      WHERE invoice_id = OLD.invoice_id;
      
    ELSIF OLD.document_type = 'executor_receipt' THEN
      UPDATE public.invoice_calculations
      SET 
        assistant_bonus_executor_receipts = GREATEST(COALESCE(assistant_bonus_executor_receipts, 0) - 1, 0),
        assistant_bonus_total = COALESCE(assistant_bonus_client_acts, 0) * 2000 
                              + GREATEST(COALESCE(assistant_bonus_executor_receipts, 0) - 1, 0) * 1000,
        updated_at = now()
      WHERE invoice_id = OLD.invoice_id;
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;