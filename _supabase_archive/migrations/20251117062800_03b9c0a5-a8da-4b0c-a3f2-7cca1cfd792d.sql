-- Drop old RLS policies that are no longer needed since we disabled RLS
DROP POLICY IF EXISTS "Admins and assistants can manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Partners can view their invoices" ON public.invoices;
DROP POLICY IF EXISTS "Clients can view their invoices" ON public.invoices;

DROP POLICY IF EXISTS "Admins and assistants can manage calculations" ON public.invoice_calculations;
DROP POLICY IF EXISTS "Partners can view their calculations" ON public.invoice_calculations;

DROP POLICY IF EXISTS "Admins and assistants can manage expenses" ON public.executor_expenses;
DROP POLICY IF EXISTS "Partners can view their expenses" ON public.executor_expenses;

DROP POLICY IF EXISTS "Admins can manage payments" ON public.partner_payments;
DROP POLICY IF EXISTS "Partners can view their payments" ON public.partner_payments;