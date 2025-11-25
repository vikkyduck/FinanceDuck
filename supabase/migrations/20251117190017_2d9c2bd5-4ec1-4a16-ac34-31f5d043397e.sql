-- Phase 1: Create Session Context Infrastructure

-- Function to set session context (used by frontend after login)
CREATE OR REPLACE FUNCTION public.set_session_context(_token_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.access_token_id', _token_id::text, false);
END;
$$;

-- Function to get current session token_id
CREATE OR REPLACE FUNCTION public.get_session_token_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.access_token_id', true), '')::uuid;
$$;

-- Function to verify access code and return token info (replaces public table access)
CREATE OR REPLACE FUNCTION public.verify_access_code(_code TEXT)
RETURNS TABLE (
  token_id UUID,
  role user_role,
  partner_id UUID,
  client_id UUID,
  is_valid BOOLEAN
)
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
  
  -- Update last_used_at
  UPDATE access_tokens
  SET last_used_at = NOW()
  WHERE code = UPPER(_code);
END;
$$;

-- Role checking functions
CREATE OR REPLACE FUNCTION public.is_admin(_token_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM access_tokens
    WHERE id = _token_id
    AND role = 'admin'
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assistant(_token_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM access_tokens
    WHERE id = _token_id
    AND role = 'assistant'
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_partner(_token_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM access_tokens
    WHERE id = _token_id
    AND role = 'partner'
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_client(_token_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM access_tokens
    WHERE id = _token_id
    AND role = 'client'
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

-- Get partner_id for current token
CREATE OR REPLACE FUNCTION public.get_token_partner_id(_token_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT partner_id FROM access_tokens
  WHERE id = _token_id
  AND role = 'partner'
  AND is_active = true
  AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;
$$;

-- Get client_id for current token
CREATE OR REPLACE FUNCTION public.get_token_client_id(_token_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM access_tokens
  WHERE id = _token_id
  AND role = 'client'
  AND is_active = true
  AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;
$$;

-- Phase 2: Secure access_tokens table
DROP POLICY IF EXISTS "Public can view active access tokens" ON access_tokens;
DROP POLICY IF EXISTS "Public can update access token usage" ON access_tokens;
DROP POLICY IF EXISTS "Authenticated users can create access tokens" ON access_tokens;

CREATE POLICY "Admins can view all tokens"
ON access_tokens FOR SELECT
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Admins can insert tokens"
ON access_tokens FOR INSERT
WITH CHECK (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Admins can update tokens"
ON access_tokens FOR UPDATE
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Admins can delete tokens"
ON access_tokens FOR DELETE
USING (public.is_admin(public.get_session_token_id()));

-- Phase 3: Secure Partners & Clients Tables (PII Protection)

-- Partners table
DROP POLICY IF EXISTS "Anyone can view partners" ON partners;
DROP POLICY IF EXISTS "Authenticated users can create partners" ON partners;
DROP POLICY IF EXISTS "Authenticated users can update partners" ON partners;

CREATE POLICY "Admins can view all partners"
ON partners FOR SELECT
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can view all partners"
ON partners FOR SELECT
USING (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Partners can view their own record"
ON partners FOR SELECT
USING (id = public.get_token_partner_id(public.get_session_token_id()));

CREATE POLICY "Admins can insert partners"
ON partners FOR INSERT
WITH CHECK (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can insert partners"
ON partners FOR INSERT
WITH CHECK (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Admins can update partners"
ON partners FOR UPDATE
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can update partners"
ON partners FOR UPDATE
USING (public.is_assistant(public.get_session_token_id()));

-- Clients table
DROP POLICY IF EXISTS "Anyone can view clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can create clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON clients;

CREATE POLICY "Admins can view all clients"
ON clients FOR SELECT
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can view all clients"
ON clients FOR SELECT
USING (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Partners can view their clients"
ON clients FOR SELECT
USING (partner_id = public.get_token_partner_id(public.get_session_token_id()));

CREATE POLICY "Clients can view their own record"
ON clients FOR SELECT
USING (id = public.get_token_client_id(public.get_session_token_id()));

CREATE POLICY "Admins can insert clients"
ON clients FOR INSERT
WITH CHECK (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can insert clients"
ON clients FOR INSERT
WITH CHECK (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Admins can update clients"
ON clients FOR UPDATE
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can update clients"
ON clients FOR UPDATE
USING (public.is_assistant(public.get_session_token_id()));

-- Phase 4: Secure Financial Data

-- Invoices table
DROP POLICY IF EXISTS "Anyone can view invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can create invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON invoices;

CREATE POLICY "Admins can view all invoices"
ON invoices FOR SELECT
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can view all invoices"
ON invoices FOR SELECT
USING (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Partners can view their invoices"
ON invoices FOR SELECT
USING (partner_id = public.get_token_partner_id(public.get_session_token_id()));

CREATE POLICY "Clients can view their invoices"
ON invoices FOR SELECT
USING (client_id = public.get_token_client_id(public.get_session_token_id()));

CREATE POLICY "Admins can insert invoices"
ON invoices FOR INSERT
WITH CHECK (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can insert invoices"
ON invoices FOR INSERT
WITH CHECK (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Admins can update invoices"
ON invoices FOR UPDATE
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can update invoices"
ON invoices FOR UPDATE
USING (public.is_assistant(public.get_session_token_id()));

-- Invoice calculations table
DROP POLICY IF EXISTS "Anyone can view calculations" ON invoice_calculations;
DROP POLICY IF EXISTS "Authenticated users can create calculations" ON invoice_calculations;
DROP POLICY IF EXISTS "Authenticated users can update calculations" ON invoice_calculations;

CREATE POLICY "Admins can view all calculations"
ON invoice_calculations FOR SELECT
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can view all calculations"
ON invoice_calculations FOR SELECT
USING (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Partners can view their calculations"
ON invoice_calculations FOR SELECT
USING (
  invoice_id IN (
    SELECT id FROM invoices
    WHERE partner_id = public.get_token_partner_id(public.get_session_token_id())
  )
);

CREATE POLICY "Clients can view their calculations"
ON invoice_calculations FOR SELECT
USING (
  invoice_id IN (
    SELECT id FROM invoices
    WHERE client_id = public.get_token_client_id(public.get_session_token_id())
  )
);

CREATE POLICY "Admins can insert calculations"
ON invoice_calculations FOR INSERT
WITH CHECK (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can insert calculations"
ON invoice_calculations FOR INSERT
WITH CHECK (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Admins can update calculations"
ON invoice_calculations FOR UPDATE
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can update calculations"
ON invoice_calculations FOR UPDATE
USING (public.is_assistant(public.get_session_token_id()));

-- Client payments table
DROP POLICY IF EXISTS "Anyone can view client payments" ON client_payments;
DROP POLICY IF EXISTS "Authenticated users can insert client payments" ON client_payments;
DROP POLICY IF EXISTS "Authenticated users can delete client payments" ON client_payments;

CREATE POLICY "Admins can view all client payments"
ON client_payments FOR SELECT
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can view all client payments"
ON client_payments FOR SELECT
USING (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Partners can view payments for their invoices"
ON client_payments FOR SELECT
USING (
  invoice_id IN (
    SELECT id FROM invoices
    WHERE partner_id = public.get_token_partner_id(public.get_session_token_id())
  )
);

CREATE POLICY "Admins can insert client payments"
ON client_payments FOR INSERT
WITH CHECK (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can insert client payments"
ON client_payments FOR INSERT
WITH CHECK (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Admins can delete client payments"
ON client_payments FOR DELETE
USING (public.is_admin(public.get_session_token_id()));

-- Partner payments table
DROP POLICY IF EXISTS "Anyone can view partner payments" ON partner_payments;
DROP POLICY IF EXISTS "Authenticated users can create partner payments" ON partner_payments;

CREATE POLICY "Admins can view all partner payments"
ON partner_payments FOR SELECT
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can view all partner payments"
ON partner_payments FOR SELECT
USING (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Partners can view their payments"
ON partner_payments FOR SELECT
USING (partner_id = public.get_token_partner_id(public.get_session_token_id()));

CREATE POLICY "Admins can insert partner payments"
ON partner_payments FOR INSERT
WITH CHECK (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can insert partner payments"
ON partner_payments FOR INSERT
WITH CHECK (public.is_assistant(public.get_session_token_id()));

-- Executor expenses table
DROP POLICY IF EXISTS "Anyone can view expenses" ON executor_expenses;
DROP POLICY IF EXISTS "Authenticated users can create expenses" ON executor_expenses;
DROP POLICY IF EXISTS "Authenticated users can delete expenses" ON executor_expenses;

CREATE POLICY "Admins can view all expenses"
ON executor_expenses FOR SELECT
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can view all expenses"
ON executor_expenses FOR SELECT
USING (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Partners can view expenses for their invoices"
ON executor_expenses FOR SELECT
USING (
  invoice_id IN (
    SELECT id FROM invoices
    WHERE partner_id = public.get_token_partner_id(public.get_session_token_id())
  )
);

CREATE POLICY "Admins can insert expenses"
ON executor_expenses FOR INSERT
WITH CHECK (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can insert expenses"
ON executor_expenses FOR INSERT
WITH CHECK (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Admins can delete expenses"
ON executor_expenses FOR DELETE
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can delete expenses"
ON executor_expenses FOR DELETE
USING (public.is_assistant(public.get_session_token_id()));

-- Invoice documents table
DROP POLICY IF EXISTS "Anyone can view invoice documents" ON invoice_documents;
DROP POLICY IF EXISTS "Anyone can insert invoice documents" ON invoice_documents;
DROP POLICY IF EXISTS "Users can delete their uploaded documents" ON invoice_documents;

CREATE POLICY "Admins can view all documents"
ON invoice_documents FOR SELECT
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can view all documents"
ON invoice_documents FOR SELECT
USING (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Partners can view documents for their invoices"
ON invoice_documents FOR SELECT
USING (
  invoice_id IN (
    SELECT id FROM invoices
    WHERE partner_id = public.get_token_partner_id(public.get_session_token_id())
  )
);

CREATE POLICY "Clients can view documents for their invoices"
ON invoice_documents FOR SELECT
USING (
  invoice_id IN (
    SELECT id FROM invoices
    WHERE client_id = public.get_token_client_id(public.get_session_token_id())
  )
);

CREATE POLICY "Admins can insert documents"
ON invoice_documents FOR INSERT
WITH CHECK (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can insert documents"
ON invoice_documents FOR INSERT
WITH CHECK (public.is_assistant(public.get_session_token_id()));

CREATE POLICY "Partners can insert documents for their invoices"
ON invoice_documents FOR INSERT
WITH CHECK (
  invoice_id IN (
    SELECT id FROM invoices
    WHERE partner_id = public.get_token_partner_id(public.get_session_token_id())
  )
);

CREATE POLICY "Admins can delete documents"
ON invoice_documents FOR DELETE
USING (public.is_admin(public.get_session_token_id()));

CREATE POLICY "Assistants can delete documents"
ON invoice_documents FOR DELETE
USING (public.is_assistant(public.get_session_token_id()));