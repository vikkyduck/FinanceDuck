-- Fix RLS functions and policies for executor_expenses access

-- 1. Ensure get_session_token_id returns correct value
CREATE OR REPLACE FUNCTION public.get_session_token_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  token_id uuid;
BEGIN
  -- Try to get from session context first
  BEGIN
    token_id := current_setting('app.access_token_id', true)::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      token_id := NULL;
  END;
  
  RETURN token_id;
END;
$function$;

-- 2. Improve is_assistant function with better error handling
CREATE OR REPLACE FUNCTION public.is_assistant(_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_role text;
BEGIN
  IF _token_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT role INTO user_role
  FROM access_tokens
  WHERE id = _token_id AND is_active = true;
  
  RETURN COALESCE(user_role = 'assistant', false);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in is_assistant for token %: %', _token_id, SQLERRM;
    RETURN false;
END;
$function$;

-- 3. Create helper function to check if user can add expense to invoice
CREATE OR REPLACE FUNCTION public.can_add_expense_to_invoice(_token_id uuid, _invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role user_role;
  v_hidden boolean;
  v_partner_id uuid;
  v_token_partner_id uuid;
BEGIN
  -- Get user role and partner_id
  SELECT role, partner_id INTO v_role, v_token_partner_id
  FROM access_tokens
  WHERE id = _token_id AND is_active = true;
  
  IF v_role IS NULL THEN
    RETURN false;
  END IF;
  
  -- Admin can always add expenses
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;
  
  -- Get invoice details
  SELECT hidden_from_assistant, partner_id INTO v_hidden, v_partner_id
  FROM invoices
  WHERE id = _invoice_id;
  
  -- Assistant can add if not hidden
  IF v_role = 'assistant' THEN
    RETURN COALESCE(NOT v_hidden, false);
  END IF;
  
  -- Partner can add to their own invoices
  IF v_role = 'partner' THEN
    RETURN v_partner_id = v_token_partner_id;
  END IF;
  
  RETURN false;
END;
$function$;

-- 4. Update RLS policy for executor_expenses INSERT
DROP POLICY IF EXISTS "Users can insert expenses for accessible invoices" ON executor_expenses;

CREATE POLICY "Users can insert expenses for accessible invoices"
ON executor_expenses
FOR INSERT
TO authenticated
WITH CHECK (
  can_add_expense_to_invoice(get_session_token_id(), invoice_id)
);

-- 5. Update RLS policy for executor_expenses SELECT
DROP POLICY IF EXISTS "Users can view expenses for accessible invoices" ON executor_expenses;

CREATE POLICY "Users can view expenses for accessible invoices"
ON executor_expenses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = executor_expenses.invoice_id
    AND (
      -- Admin sees all
      is_admin(get_session_token_id())
      -- Assistant sees non-hidden
      OR (is_assistant(get_session_token_id()) AND i.hidden_from_assistant = false)
      -- Partner sees their own
      OR (is_partner(get_session_token_id()) AND i.partner_id = get_token_partner_id(get_session_token_id()))
    )
  )
);

-- 6. Add helpful error messages via comments
COMMENT ON FUNCTION can_add_expense_to_invoice IS 'Checks if user has permission to add expense to invoice. Returns false if invoice is hidden from assistant or user lacks access.';