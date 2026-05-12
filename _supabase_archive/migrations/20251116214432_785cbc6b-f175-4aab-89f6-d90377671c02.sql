-- Create enum for user roles
CREATE TYPE user_role AS ENUM ('assistant', 'partner', 'admin', 'client');

-- Create enum for invoice schemes
CREATE TYPE invoice_scheme AS ENUM ('partner_10', 'partner_15', 'agency_30', 'vika_ie_7');

-- Create enum for invoice status
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'cancelled');

-- Create partners table
CREATE TABLE public.partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  partner_id UUID REFERENCES public.partners(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table to assign roles to users
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role user_role NOT NULL,
  partner_id UUID REFERENCES public.partners(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create invoices table
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES public.clients(id) NOT NULL,
  partner_id UUID REFERENCES public.partners(id) NOT NULL,
  scheme invoice_scheme NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  payment_date DATE,
  notes TEXT
);

-- Create invoice_calculations table
CREATE TABLE public.invoice_calculations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
  
  -- Input fields
  client_bill NUMERIC(15, 2) NOT NULL,
  
  -- Scheme 10%/15%/7% fields
  commission_rate NUMERIC(5, 2),
  commission_amount NUMERIC(15, 2),
  amount_to_admin NUMERIC(15, 2),
  
  -- Scheme 30% specific fields
  agency_margin NUMERIC(15, 2),
  partner_share_from_margin NUMERIC(15, 2),
  admin_share_from_margin NUMERIC(15, 2),
  client_base_after_margin NUMERIC(15, 2),
  client_spent NUMERIC(15, 2) DEFAULT 0,
  client_remaining NUMERIC(15, 2),
  
  -- Common fields
  executor_expenses_total NUMERIC(15, 2) DEFAULT 0,
  net_profit_admin NUMERIC(15, 2),
  admin_share_50 NUMERIC(15, 2),
  cat_share_50 NUMERIC(15, 2),
  
  -- Assistant bonuses
  assistant_bonus_acts NUMERIC(15, 2) DEFAULT 0,
  assistant_bonus_paid BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create executor_expenses table
CREATE TABLE public.executor_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create partner_payments table (track partner debt payments)
CREATE TABLE public.partner_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID REFERENCES public.partners(id) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  payment_date DATE NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executor_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for partners
CREATE POLICY "Admins can view all partners" ON public.partners FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can manage partners" ON public.partners FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Partners can view their own info" ON public.partners FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'partner' AND partner_id = id)
);

-- RLS Policies for clients
CREATE POLICY "Admins and assistants can view all clients" ON public.clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

CREATE POLICY "Partners can view their clients" ON public.clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'partner' AND partner_id = partner_id)
);

CREATE POLICY "Clients can view their own info" ON public.clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'client')
);

CREATE POLICY "Admins and assistants can manage clients" ON public.clients FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (
  user_id = auth.uid()
);

CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- RLS Policies for invoices
CREATE POLICY "Admins and assistants can view all invoices" ON public.invoices FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

CREATE POLICY "Partners can view their invoices" ON public.invoices FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'partner' AND partner_id = partner_id)
);

CREATE POLICY "Clients can view their invoices" ON public.invoices FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.clients c ON c.id = client_id
    WHERE ur.user_id = auth.uid() AND ur.role = 'client'
  )
);

CREATE POLICY "Admins and assistants can manage invoices" ON public.invoices FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

-- RLS Policies for invoice_calculations
CREATE POLICY "Admins and assistants can view all calculations" ON public.invoice_calculations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

CREATE POLICY "Partners can view their invoice calculations" ON public.invoice_calculations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.invoices i ON i.id = invoice_id
    WHERE ur.user_id = auth.uid() AND ur.role = 'partner' AND ur.partner_id = i.partner_id
  )
);

CREATE POLICY "Clients can view their invoice calculations" ON public.invoice_calculations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.invoices i ON i.id = invoice_id
    JOIN public.clients c ON c.id = i.client_id
    WHERE ur.user_id = auth.uid() AND ur.role = 'client'
  )
);

CREATE POLICY "Admins and assistants can manage calculations" ON public.invoice_calculations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

-- RLS Policies for executor_expenses
CREATE POLICY "Admins and assistants can view all expenses" ON public.executor_expenses FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

CREATE POLICY "Partners can view expenses for their invoices" ON public.executor_expenses FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.invoices i ON i.id = invoice_id
    WHERE ur.user_id = auth.uid() AND ur.role = 'partner' AND ur.partner_id = i.partner_id
  )
);

CREATE POLICY "Admins and assistants can manage expenses" ON public.executor_expenses FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

-- RLS Policies for partner_payments
CREATE POLICY "Admins can view all payments" ON public.partner_payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Partners can view their payments" ON public.partner_payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'partner' AND partner_id = partner_id)
);

CREATE POLICY "Admins can manage payments" ON public.partner_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Triggers for updated_at
CREATE TRIGGER update_partners_updated_at BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_calculations_updated_at BEFORE UPDATE ON public.invoice_calculations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to recalculate invoice totals
CREATE OR REPLACE FUNCTION recalculate_invoice_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Update executor_expenses_total
  UPDATE public.invoice_calculations
  SET executor_expenses_total = (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.executor_expenses
    WHERE invoice_id = NEW.invoice_id
  ),
  updated_at = now()
  WHERE invoice_id = NEW.invoice_id;
  
  -- Recalculate based on scheme
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
  
  -- Update admin and cat shares
  UPDATE public.invoice_calculations
  SET 
    admin_share_50 = net_profit_admin / 2,
    cat_share_50 = net_profit_admin / 2,
    updated_at = now()
  WHERE invoice_id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for expense recalculation
CREATE TRIGGER recalculate_on_expense_change
AFTER INSERT OR UPDATE OR DELETE ON public.executor_expenses
FOR EACH ROW EXECUTE FUNCTION recalculate_invoice_totals();