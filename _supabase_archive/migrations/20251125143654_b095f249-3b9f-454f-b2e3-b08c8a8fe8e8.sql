-- Create RPC function for getting assistant statistics invoices
-- This ensures context and query happen in the same transaction
CREATE OR REPLACE FUNCTION get_assistant_stats_invoices(
  _token_id UUID,
  _year INTEGER
)
RETURNS TABLE(
  id UUID,
  invoice_number TEXT,
  client_id UUID,
  partner_id UUID,
  scheme invoice_scheme,
  status invoice_status,
  actual_payment_date DATE,
  created_at TIMESTAMPTZ,
  client_bill NUMERIC,
  executor_expenses_total NUMERIC,
  client_spent NUMERIC,
  agency_margin NUMERIC,
  partner_share_from_margin NUMERIC,
  commission_amount NUMERIC,
  assistant_bonus_total NUMERIC,
  partner_name TEXT,
  partner_id_ref UUID,
  client_name TEXT,
  client_id_ref UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set session context in the same transaction
  PERFORM set_session_context(_token_id);
  
  -- Return query with all needed data
  RETURN QUERY
  SELECT 
    i.id,
    i.invoice_number,
    i.client_id,
    i.partner_id,
    i.scheme,
    i.status,
    i.actual_payment_date,
    i.created_at,
    ic.client_bill,
    ic.executor_expenses_total,
    ic.client_spent,
    ic.agency_margin,
    ic.partner_share_from_margin,
    ic.commission_amount,
    ic.assistant_bonus_total,
    p.name as partner_name,
    p.id as partner_id_ref,
    c.name as client_name,
    c.id as client_id_ref
  FROM invoices i
  LEFT JOIN invoice_calculations ic ON ic.invoice_id = i.id
  LEFT JOIN partners p ON i.partner_id = p.id
  LEFT JOIN clients c ON i.client_id = c.id
  WHERE i.status = 'paid'
    AND i.hidden_from_assistant = false
    AND EXTRACT(YEAR FROM i.actual_payment_date) = _year
  ORDER BY i.actual_payment_date;
END;
$$;