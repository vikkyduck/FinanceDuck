-- CRITICAL SECURITY FIX: Block all anonymous access to all tables
-- All tables have RLS policies requiring authentication, but anonymous users can still read data
-- This migration adds explicit DENY policies for anonymous/unauthenticated users

-- Block anonymous access to clients table (contains email, phone)
CREATE POLICY "Block anonymous access to clients"
ON clients FOR ALL
TO anon
USING (false);

-- Block anonymous access to partners table (contains email, phone)
CREATE POLICY "Block anonymous access to partners"
ON partners FOR ALL
TO anon
USING (false);

-- Block anonymous access to access_tokens table (CRITICAL: contains auth codes)
CREATE POLICY "Block anonymous access to access_tokens"
ON access_tokens FOR ALL
TO anon
USING (false);

-- Block anonymous access to invoices table (contains business data)
CREATE POLICY "Block anonymous access to invoices"
ON invoices FOR ALL
TO anon
USING (false);

-- Block anonymous access to invoice_calculations table (contains financial data)
CREATE POLICY "Block anonymous access to invoice_calculations"
ON invoice_calculations FOR ALL
TO anon
USING (false);

-- Block anonymous access to client_payments table (contains payment data)
CREATE POLICY "Block anonymous access to client_payments"
ON client_payments FOR ALL
TO anon
USING (false);

-- Block anonymous access to partner_payments table (contains payment data)
CREATE POLICY "Block anonymous access to partner_payments"
ON partner_payments FOR ALL
TO anon
USING (false);

-- Block anonymous access to executor_expenses table (contains expense data)
CREATE POLICY "Block anonymous access to executor_expenses"
ON executor_expenses FOR ALL
TO anon
USING (false);

-- Block anonymous access to invoice_documents table (contains file metadata)
CREATE POLICY "Block anonymous access to invoice_documents"
ON invoice_documents FOR ALL
TO anon
USING (false);

-- Block anonymous access to user_roles table (contains role assignments)
CREATE POLICY "Block anonymous access to user_roles"
ON user_roles FOR ALL
TO anon
USING (false);

-- Block anonymous access to security_events table (contains security logs)
CREATE POLICY "Block anonymous access to security_events"
ON security_events FOR ALL
TO anon
USING (false);

-- Block anonymous access to login_attempts table (contains auth logs)
CREATE POLICY "Block anonymous access to login_attempts"
ON login_attempts FOR ALL
TO anon
USING (false);

-- Block anonymous access to rate_limit_violations table (contains security data)
CREATE POLICY "Block anonymous access to rate_limit_violations"
ON rate_limit_violations FOR ALL
TO anon
USING (false);

-- Block anonymous access to rate_limit_state table (contains rate limit data)
CREATE POLICY "Block anonymous access to rate_limit_state"
ON rate_limit_state FOR ALL
TO anon
USING (false);