-- Drop trigger first, then function
DROP TRIGGER IF EXISTS recalculate_on_expense_change ON public.executor_expenses;
DROP FUNCTION IF EXISTS recalculate_invoice_totals() CASCADE;

-- Recreate function with proper search_path
CREATE OR REPLACE FUNCTION recalculate_invoice_totals()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Recreate trigger
CREATE TRIGGER recalculate_on_expense_change
AFTER INSERT OR UPDATE OR DELETE ON public.executor_expenses
FOR EACH ROW EXECUTE FUNCTION recalculate_invoice_totals();

-- Fix RLS policies for partners
DROP POLICY IF EXISTS "Admins can manage partners" ON public.partners;
DROP POLICY IF EXISTS "Admins and assistants can manage partners" ON public.partners;

CREATE POLICY "Admins and assistants can view partners" ON public.partners 
FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

CREATE POLICY "Admins and assistants can insert partners" ON public.partners 
FOR INSERT 
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

CREATE POLICY "Admins and assistants can update partners" ON public.partners 
FOR UPDATE 
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

CREATE POLICY "Admins and assistants can delete partners" ON public.partners 
FOR DELETE 
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

-- Fix RLS policies for clients
DROP POLICY IF EXISTS "Admins and assistants can manage clients" ON public.clients;

CREATE POLICY "Admins and assistants can view clients" ON public.clients 
FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

CREATE POLICY "Admins and assistants can insert clients" ON public.clients 
FOR INSERT 
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

CREATE POLICY "Admins and assistants can update clients" ON public.clients 
FOR UPDATE 
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);

CREATE POLICY "Admins and assistants can delete clients" ON public.clients 
FOR DELETE 
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'assistant'))
);