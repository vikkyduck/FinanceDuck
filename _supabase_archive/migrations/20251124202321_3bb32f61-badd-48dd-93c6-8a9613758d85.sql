-- Fix ALL assistant RLS policies to use 'public' role instead of 'authenticated'
-- This project uses custom auth via access_tokens, not Supabase Auth

-- ============ INVOICE_CALCULATIONS ============
DROP POLICY IF EXISTS "Assistants can insert calculations" ON public.invoice_calculations;
DROP POLICY IF EXISTS "Assistants can update calculations" ON public.invoice_calculations;
DROP POLICY IF EXISTS "Assistants can view all calculations" ON public.invoice_calculations;

CREATE POLICY "Assistants can insert calculations" 
ON public.invoice_calculations 
FOR INSERT 
TO public
WITH CHECK (is_assistant(get_session_token_id()) AND assistant_can_see_invoice(invoice_id));

CREATE POLICY "Assistants can update calculations" 
ON public.invoice_calculations 
FOR UPDATE 
TO public
USING (is_assistant(get_session_token_id()) AND assistant_can_see_invoice(invoice_id));

CREATE POLICY "Assistants can view all calculations" 
ON public.invoice_calculations 
FOR SELECT 
TO public
USING (is_assistant(get_session_token_id()) AND assistant_can_see_invoice(invoice_id));

-- ============ INVOICE_DOCUMENTS ============
DROP POLICY IF EXISTS "Assistants can delete documents" ON public.invoice_documents;
DROP POLICY IF EXISTS "Assistants can insert documents" ON public.invoice_documents;
DROP POLICY IF EXISTS "Assistants can view all documents" ON public.invoice_documents;

CREATE POLICY "Assistants can delete documents" 
ON public.invoice_documents 
FOR DELETE 
TO public
USING (is_assistant(get_session_token_id()) AND (invoice_id IN (
  SELECT id FROM invoices WHERE hidden_from_assistant = false
)));

CREATE POLICY "Assistants can insert documents" 
ON public.invoice_documents 
FOR INSERT 
TO public
WITH CHECK (is_assistant(get_session_token_id()) AND (invoice_id IN (
  SELECT id FROM invoices WHERE hidden_from_assistant = false
)));

CREATE POLICY "Assistants can view all documents" 
ON public.invoice_documents 
FOR SELECT 
TO public
USING (is_assistant(get_session_token_id()) AND (invoice_id IN (
  SELECT id FROM invoices WHERE hidden_from_assistant = false
)));

-- ============ INVOICES ============
DROP POLICY IF EXISTS "Assistants can delete invoices" ON public.invoices;
DROP POLICY IF EXISTS "Assistants can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Assistants can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Assistants can update non-hidden invoices" ON public.invoices;
DROP POLICY IF EXISTS "Assistants can view all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Assistants can view non-hidden invoices" ON public.invoices;

CREATE POLICY "Assistants can delete invoices" 
ON public.invoices 
FOR DELETE 
TO public
USING (is_assistant(get_session_token_id()));

CREATE POLICY "Assistants can insert invoices" 
ON public.invoices 
FOR INSERT 
TO public
WITH CHECK (is_assistant(get_session_token_id()));

CREATE POLICY "Assistants can update non-hidden invoices" 
ON public.invoices 
FOR UPDATE 
TO public
USING (is_assistant(get_session_token_id()) AND hidden_from_assistant = false);

CREATE POLICY "Assistants can view non-hidden invoices" 
ON public.invoices 
FOR SELECT 
TO public
USING (is_assistant(get_session_token_id()) AND hidden_from_assistant = false);

-- ============ CLIENT_PAYMENTS ============
DROP POLICY IF EXISTS "Assistants can insert client payments" ON public.client_payments;
DROP POLICY IF EXISTS "Assistants can view all client payments" ON public.client_payments;

CREATE POLICY "Assistants can insert client payments" 
ON public.client_payments 
FOR INSERT 
TO public
WITH CHECK (is_assistant(get_session_token_id()) AND (invoice_id IN (
  SELECT id FROM invoices WHERE hidden_from_assistant = false
)));

CREATE POLICY "Assistants can view all client payments" 
ON public.client_payments 
FOR SELECT 
TO public
USING (is_assistant(get_session_token_id()) AND (invoice_id IN (
  SELECT id FROM invoices WHERE hidden_from_assistant = false
)));

-- ============ PARTNER_PAYMENTS ============
DROP POLICY IF EXISTS "Assistants can insert partner payments" ON public.partner_payments;
DROP POLICY IF EXISTS "Assistants can view all partner payments" ON public.partner_payments;

CREATE POLICY "Assistants can insert partner payments" 
ON public.partner_payments 
FOR INSERT 
TO public
WITH CHECK (is_assistant(get_session_token_id()));

CREATE POLICY "Assistants can view all partner payments" 
ON public.partner_payments 
FOR SELECT 
TO public
USING (is_assistant(get_session_token_id()));

-- ============ RECURRING_INVOICES ============
DROP POLICY IF EXISTS "Assistants can manage recurring invoices" ON public.recurring_invoices;

CREATE POLICY "Assistants can manage recurring invoices" 
ON public.recurring_invoices 
FOR ALL 
TO public
USING (is_assistant(get_session_token_id()))
WITH CHECK (is_assistant(get_session_token_id()));