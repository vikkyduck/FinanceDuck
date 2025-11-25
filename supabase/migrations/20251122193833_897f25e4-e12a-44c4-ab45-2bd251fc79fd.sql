-- Create recurring_invoices table for automated invoice generation
CREATE TABLE IF NOT EXISTS public.recurring_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  scheme invoice_scheme NOT NULL,
  partner_commission_rate NUMERIC,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
  day_of_month INTEGER NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 28),
  is_active BOOLEAN NOT NULL DEFAULT true,
  next_invoice_date DATE NOT NULL,
  last_generated_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage recurring invoices"
  ON public.recurring_invoices
  FOR ALL
  USING (is_admin(get_session_token_id()))
  WITH CHECK (is_admin(get_session_token_id()));

CREATE POLICY "Assistants can manage recurring invoices"
  ON public.recurring_invoices
  FOR ALL
  USING (is_assistant(get_session_token_id()))
  WITH CHECK (is_assistant(get_session_token_id()));

CREATE POLICY "Partners can view their recurring invoices"
  ON public.recurring_invoices
  FOR SELECT
  USING (partner_id = get_token_partner_id(get_session_token_id()));

CREATE POLICY "Clients can view their recurring invoices"
  ON public.recurring_invoices
  FOR SELECT
  USING (client_id = get_token_client_id(get_session_token_id()));

-- Add indexes
CREATE INDEX idx_recurring_invoices_next_date ON public.recurring_invoices(next_invoice_date) WHERE is_active = true;
CREATE INDEX idx_recurring_invoices_client ON public.recurring_invoices(client_id);
CREATE INDEX idx_recurring_invoices_partner ON public.recurring_invoices(partner_id);

-- Trigger for updated_at
CREATE TRIGGER update_recurring_invoices_updated_at
  BEFORE UPDATE ON public.recurring_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add priority level to invoices for escalation
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS priority_level TEXT DEFAULT 'normal' CHECK (priority_level IN ('normal', 'high', 'critical'));

-- Create index for overdue invoices (we'll calculate overdue days in queries)
CREATE INDEX idx_invoices_overdue ON public.invoices(status, payment_date) WHERE status = 'sent' AND payment_date IS NOT NULL;