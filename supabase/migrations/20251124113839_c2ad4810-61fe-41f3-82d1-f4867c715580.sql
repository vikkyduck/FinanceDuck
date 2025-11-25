-- Add helper function to create executor expenses with explicit token
CREATE OR REPLACE FUNCTION public.add_executor_expense(
  _token_id uuid,
  _invoice_id uuid,
  _description text,
  _amount numeric,
  _date date DEFAULT CURRENT_DATE,
  _is_admin_expense boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed boolean;
  v_expense_id uuid;
BEGIN
  -- Basic validation
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF _description IS NULL OR trim(_description) = '' THEN
    RAISE EXCEPTION 'Description is required';
  END IF;

  -- Check permission using existing helper that encapsulates role logic
  v_allowed := can_add_expense_to_invoice(_token_id, _invoice_id);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  -- Insert expense record
  INSERT INTO public.executor_expenses (
    invoice_id,
    description,
    amount,
    date,
    created_by,
    is_admin_expense
  ) VALUES (
    _invoice_id,
    trim(_description),
    _amount,
    COALESCE(_date, CURRENT_DATE),
    _token_id,
    COALESCE(_is_admin_expense, false)
  )
  RETURNING id INTO v_expense_id;

  RETURN v_expense_id;
END;
$function$;