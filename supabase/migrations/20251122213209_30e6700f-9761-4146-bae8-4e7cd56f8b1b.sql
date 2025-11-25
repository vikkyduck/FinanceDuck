-- Fix RLS policy for invoice_calculations for assistants
-- The issue is that the policy uses a subquery to invoices table which also has RLS
-- This can cause recursion or blocking issues
-- Solution: Use a SECURITY DEFINER function to check if invoice is accessible to assistant

-- First, create a security definer function to check if assistant can see invoice
CREATE OR REPLACE FUNCTION public.assistant_can_see_invoice(_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_hidden boolean;
BEGIN
  SELECT hidden_from_assistant INTO is_hidden
  FROM invoices
  WHERE id = _invoice_id;
  
  -- If invoice not found or is hidden, return false
  RETURN COALESCE(NOT is_hidden, false);
END;
$$;

-- Drop the existing policy
DROP POLICY IF EXISTS "Assistants can view all calculations" ON invoice_calculations;

-- Create new policy using the security definer function
CREATE POLICY "Assistants can view all calculations"
ON invoice_calculations
FOR SELECT
TO authenticated
USING (
  is_assistant(get_session_token_id()) 
  AND assistant_can_see_invoice(invoice_id)
);

-- Also update the INSERT and UPDATE policies for assistants to use the same function
DROP POLICY IF EXISTS "Assistants can insert calculations" ON invoice_calculations;
DROP POLICY IF EXISTS "Assistants can update calculations" ON invoice_calculations;

CREATE POLICY "Assistants can insert calculations"
ON invoice_calculations
FOR INSERT
TO authenticated
WITH CHECK (
  is_assistant(get_session_token_id())
  AND assistant_can_see_invoice(invoice_id)
);

CREATE POLICY "Assistants can update calculations"
ON invoice_calculations
FOR UPDATE
TO authenticated
USING (
  is_assistant(get_session_token_id())
  AND assistant_can_see_invoice(invoice_id)
);