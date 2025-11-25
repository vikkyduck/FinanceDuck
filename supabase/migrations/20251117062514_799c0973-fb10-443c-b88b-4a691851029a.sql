-- Disable RLS on invoice-related tables since we use custom localStorage authentication
ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_calculations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.executor_expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payments DISABLE ROW LEVEL SECURITY;