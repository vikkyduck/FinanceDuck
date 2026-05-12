-- Enable realtime for invoices table (if not already enabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'invoices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
  END IF;
END $$;

-- Enable realtime for executor_expenses table (if not already enabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'executor_expenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.executor_expenses;
  END IF;
END $$;

-- Enable realtime for client_payments table (if not already enabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'client_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_payments;
  END IF;
END $$;

-- Enable realtime for partner_payments table (if not already enabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'partner_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_payments;
  END IF;
END $$;

-- Enable realtime for invoice_documents table (if not already enabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'invoice_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_documents;
  END IF;
END $$;