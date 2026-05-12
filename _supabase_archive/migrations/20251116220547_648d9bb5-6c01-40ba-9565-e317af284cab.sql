-- Create access tokens table first
CREATE TABLE IF NOT EXISTS public.access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  role user_role NOT NULL,
  partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Drop ALL existing policies from ALL tables before modifying user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins and assistants can view partners" ON public.partners;
DROP POLICY IF EXISTS "Admins and assistants can insert partners" ON public.partners;
DROP POLICY IF EXISTS "Admins and assistants can update partners" ON public.partners;
DROP POLICY IF EXISTS "Admins and assistants can delete partners" ON public.partners;
DROP POLICY IF EXISTS "Partners can view their own info" ON public.partners;
DROP POLICY IF EXISTS "Admins can view all partners" ON public.partners;
DROP POLICY IF EXISTS "Admins and assistants can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Admins and assistants can view clients" ON public.clients;
DROP POLICY IF EXISTS "Admins and assistants can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Admins and assistants can update clients" ON public.clients;
DROP POLICY IF EXISTS "Admins and assistants can delete clients" ON public.clients;
DROP POLICY IF EXISTS "Partners can view their clients" ON public.clients;
DROP POLICY IF EXISTS "Clients can view their own info" ON public.clients;
DROP POLICY IF EXISTS "Admins and assistants can view all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins and assistants can manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Partners can view their invoices" ON public.invoices;
DROP POLICY IF EXISTS "Clients can view their invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins and assistants can view all calculations" ON public.invoice_calculations;
DROP POLICY IF EXISTS "Admins and assistants can manage calculations" ON public.invoice_calculations;
DROP POLICY IF EXISTS "Partners can view their invoice calculations" ON public.invoice_calculations;
DROP POLICY IF EXISTS "Clients can view their invoice calculations" ON public.invoice_calculations;
DROP POLICY IF EXISTS "Admins and assistants can view all expenses" ON public.executor_expenses;
DROP POLICY IF EXISTS "Admins and assistants can manage expenses" ON public.executor_expenses;
DROP POLICY IF EXISTS "Partners can view expenses for their invoices" ON public.executor_expenses;
DROP POLICY IF EXISTS "Admins can view all payments" ON public.partner_payments;
DROP POLICY IF EXISTS "Partners can view their payments" ON public.partner_payments;
DROP POLICY IF EXISTS "Admins can manage payments" ON public.partner_payments;

-- Now safe to modify user_roles table
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS access_token_id UUID REFERENCES public.access_tokens(id) ON DELETE CASCADE;

-- Create first admin access token
INSERT INTO public.access_tokens (code, role, is_active)
VALUES ('ADM-001', 'admin', true)
ON CONFLICT (code) DO NOTHING;

-- Create user_role for the admin token
DO $$
DECLARE
  admin_token_id UUID;
BEGIN
  SELECT id INTO admin_token_id FROM public.access_tokens WHERE code = 'ADM-001';
  
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE access_token_id = admin_token_id) THEN
    INSERT INTO public.user_roles (access_token_id, role) VALUES (admin_token_id, 'admin');
  END IF;
END $$;

-- Enable RLS on access_tokens
ALTER TABLE public.access_tokens ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for access_tokens
CREATE POLICY "Anyone can read active tokens for login"
ON public.access_tokens
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage access tokens"
ON public.access_tokens
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role = 'admin'
  )
);

-- Create RLS policies for user_roles
CREATE POLICY "Access tokens can view their roles"
ON public.user_roles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens
    WHERE access_tokens.id = user_roles.access_token_id
    AND access_tokens.code = current_setting('app.current_access_code', true)
  )
);

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role = 'admin'
  )
);

-- Partners policies
CREATE POLICY "Admins and assistants can manage partners"
ON public.partners
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role IN ('admin', 'assistant')
  )
);

CREATE POLICY "Partners can view their own info"
ON public.partners
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role = 'partner'
    AND ur.partner_id = partners.id
  )
);

-- Clients policies
CREATE POLICY "Admins and assistants can manage clients"
ON public.clients
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role IN ('admin', 'assistant')
  )
);

CREATE POLICY "Partners can view their clients"
ON public.clients
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role = 'partner'
    AND ur.partner_id = clients.partner_id
  )
);

-- Invoices policies
CREATE POLICY "Admins and assistants can manage invoices"
ON public.invoices
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role IN ('admin', 'assistant')
  )
);

CREATE POLICY "Partners can view their invoices"
ON public.invoices
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role = 'partner'
    AND ur.partner_id = invoices.partner_id
  )
);

CREATE POLICY "Clients can view their invoices"
ON public.invoices
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role = 'client'
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = invoices.client_id
    )
  )
);

-- Invoice calculations policies
CREATE POLICY "Admins and assistants can manage calculations"
ON public.invoice_calculations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role IN ('admin', 'assistant')
  )
);

CREATE POLICY "Partners can view their calculations"
ON public.invoice_calculations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    JOIN public.invoices i ON i.id = invoice_calculations.invoice_id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role = 'partner'
    AND ur.partner_id = i.partner_id
  )
);

-- Executor expenses policies
CREATE POLICY "Admins and assistants can manage expenses"
ON public.executor_expenses
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role IN ('admin', 'assistant')
  )
);

CREATE POLICY "Partners can view their expenses"
ON public.executor_expenses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    JOIN public.invoices i ON i.id = executor_expenses.invoice_id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role = 'partner'
    AND ur.partner_id = i.partner_id
  )
);

-- Partner payments policies
CREATE POLICY "Admins can manage payments"
ON public.partner_payments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role = 'admin'
  )
);

CREATE POLICY "Partners can view their payments"
ON public.partner_payments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.access_tokens at
    JOIN public.user_roles ur ON ur.access_token_id = at.id
    WHERE at.code = current_setting('app.current_access_code', true)
    AND ur.role = 'partner'
    AND ur.partner_id = partner_payments.partner_id
  )
);