-- ============================================
-- RLS POLICIES FOR INVOICES TABLE
-- Critical fix: Enable data access for all user roles
-- ============================================

-- Drop existing policies if any (clean slate)
DROP POLICY IF EXISTS "Admins can view all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;

DROP POLICY IF EXISTS "Assistants can view non-hidden invoices" ON public.invoices;
DROP POLICY IF EXISTS "Assistants can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Assistants can update non-hidden invoices" ON public.invoices;

DROP POLICY IF EXISTS "Partners can view their invoices" ON public.invoices;

DROP POLICY IF EXISTS "Clients can view their invoices" ON public.invoices;

DROP POLICY IF EXISTS "Block anonymous access to invoices" ON public.invoices;

-- ============================================
-- ADMIN POLICIES (Full access)
-- ============================================
CREATE POLICY "Admins can view all invoices"
  ON public.invoices
  FOR SELECT
  USING (is_admin(get_session_token_id()));

CREATE POLICY "Admins can insert invoices"
  ON public.invoices
  FOR INSERT
  WITH CHECK (is_admin(get_session_token_id()));

CREATE POLICY "Admins can update invoices"
  ON public.invoices
  FOR UPDATE
  USING (is_admin(get_session_token_id()));

CREATE POLICY "Admins can delete invoices"
  ON public.invoices
  FOR DELETE
  USING (is_admin(get_session_token_id()));

-- ============================================
-- ASSISTANT POLICIES (Access to non-hidden invoices)
-- ============================================
CREATE POLICY "Assistants can view non-hidden invoices"
  ON public.invoices
  FOR SELECT
  USING (
    is_assistant(get_session_token_id()) 
    AND hidden_from_assistant = false
  );

CREATE POLICY "Assistants can insert invoices"
  ON public.invoices
  FOR INSERT
  WITH CHECK (is_assistant(get_session_token_id()));

CREATE POLICY "Assistants can update non-hidden invoices"
  ON public.invoices
  FOR UPDATE
  USING (
    is_assistant(get_session_token_id()) 
    AND hidden_from_assistant = false
  );

-- ============================================
-- PARTNER POLICIES (Access to their own invoices)
-- ============================================
CREATE POLICY "Partners can view their invoices"
  ON public.invoices
  FOR SELECT
  USING (
    partner_id = get_token_partner_id(get_session_token_id())
  );

-- ============================================
-- CLIENT POLICIES (Access to their own invoices)
-- ============================================
CREATE POLICY "Clients can view their invoices"
  ON public.invoices
  FOR SELECT
  USING (
    client_id = get_token_client_id(get_session_token_id())
  );

-- ============================================
-- SECURITY: Block anonymous access
-- ============================================
CREATE POLICY "Block anonymous access to invoices"
  ON public.invoices
  FOR ALL
  TO anon
  USING (false);

-- ============================================
-- Verify RLS is enabled
-- ============================================
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Add similar policies for related tables if missing
-- ============================================

-- Partners table policies
DROP POLICY IF EXISTS "Admins can view all partners" ON public.partners;
DROP POLICY IF EXISTS "Assistants can view all partners" ON public.partners;
DROP POLICY IF EXISTS "Partners can view their own record" ON public.partners;
DROP POLICY IF EXISTS "Clients can view their partners" ON public.partners;

CREATE POLICY "Admins can view all partners"
  ON public.partners FOR SELECT
  USING (is_admin(get_session_token_id()));

CREATE POLICY "Assistants can view all partners"
  ON public.partners FOR SELECT
  USING (is_assistant(get_session_token_id()));

CREATE POLICY "Partners can view their own record"
  ON public.partners FOR SELECT
  USING (id = get_token_partner_id(get_session_token_id()));

CREATE POLICY "Clients can view their partners"
  ON public.partners FOR SELECT
  USING (
    id IN (
      SELECT partner_id 
      FROM client_partners 
      WHERE client_id = get_token_client_id(get_session_token_id())
    )
  );

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;