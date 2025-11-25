-- Add hidden_from_assistant column to invoices table
ALTER TABLE public.invoices 
ADD COLUMN hidden_from_assistant boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.invoices.hidden_from_assistant IS 'Если true, счет не виден ассистенту, но виден админу и участвует во всех расчетах';

-- Update RLS policy for assistants to exclude hidden invoices
DROP POLICY IF EXISTS "Assistants can view all invoices" ON public.invoices;

CREATE POLICY "Assistants can view all invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  is_assistant(get_session_token_id()) 
  AND hidden_from_assistant = false
);

-- Update RLS policy for assistants insert to prevent creating hidden invoices
DROP POLICY IF EXISTS "Assistants can insert invoices" ON public.invoices;

CREATE POLICY "Assistants can insert invoices"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (
  is_assistant(get_session_token_id()) 
  AND (hidden_from_assistant = false OR hidden_from_assistant IS NULL)
);

-- Update RLS policy for assistants update to prevent modifying hidden flag
DROP POLICY IF EXISTS "Assistants can update invoices" ON public.invoices;

CREATE POLICY "Assistants can update invoices"
ON public.invoices
FOR UPDATE
TO authenticated
USING (
  is_assistant(get_session_token_id()) 
  AND hidden_from_assistant = false
);

-- Same for invoice_calculations
DROP POLICY IF EXISTS "Assistants can view all calculations" ON public.invoice_calculations;

CREATE POLICY "Assistants can view all calculations"
ON public.invoice_calculations
FOR SELECT
TO authenticated
USING (
  is_assistant(get_session_token_id()) 
  AND invoice_id IN (
    SELECT id FROM public.invoices 
    WHERE hidden_from_assistant = false
  )
);

DROP POLICY IF EXISTS "Assistants can insert calculations" ON public.invoice_calculations;

CREATE POLICY "Assistants can insert calculations"
ON public.invoice_calculations
FOR INSERT
TO authenticated
WITH CHECK (
  is_assistant(get_session_token_id()) 
  AND invoice_id IN (
    SELECT id FROM public.invoices 
    WHERE hidden_from_assistant = false
  )
);

DROP POLICY IF EXISTS "Assistants can update calculations" ON public.invoice_calculations;

CREATE POLICY "Assistants can update calculations"
ON public.invoice_calculations
FOR UPDATE
TO authenticated
USING (
  is_assistant(get_session_token_id()) 
  AND invoice_id IN (
    SELECT id FROM public.invoices 
    WHERE hidden_from_assistant = false
  )
);

-- Same for executor_expenses
DROP POLICY IF EXISTS "Assistants can view all expenses" ON public.executor_expenses;

CREATE POLICY "Assistants can view all expenses"
ON public.executor_expenses
FOR SELECT
TO authenticated
USING (
  is_assistant(get_session_token_id()) 
  AND invoice_id IN (
    SELECT id FROM public.invoices 
    WHERE hidden_from_assistant = false
  )
);

DROP POLICY IF EXISTS "Assistants can insert expenses" ON public.executor_expenses;

CREATE POLICY "Assistants can insert expenses"
ON public.executor_expenses
FOR INSERT
TO authenticated
WITH CHECK (
  is_assistant(get_session_token_id()) 
  AND invoice_id IN (
    SELECT id FROM public.invoices 
    WHERE hidden_from_assistant = false
  )
);

DROP POLICY IF EXISTS "Assistants can delete expenses" ON public.executor_expenses;

CREATE POLICY "Assistants can delete expenses"
ON public.executor_expenses
FOR DELETE
TO authenticated
USING (
  is_assistant(get_session_token_id()) 
  AND invoice_id IN (
    SELECT id FROM public.invoices 
    WHERE hidden_from_assistant = false
  )
);

-- Same for invoice_documents
DROP POLICY IF EXISTS "Assistants can view all documents" ON public.invoice_documents;

CREATE POLICY "Assistants can view all documents"
ON public.invoice_documents
FOR SELECT
TO authenticated
USING (
  is_assistant(get_session_token_id()) 
  AND invoice_id IN (
    SELECT id FROM public.invoices 
    WHERE hidden_from_assistant = false
  )
);

DROP POLICY IF EXISTS "Assistants can insert documents" ON public.invoice_documents;

CREATE POLICY "Assistants can insert documents"
ON public.invoice_documents
FOR INSERT
TO authenticated
WITH CHECK (
  is_assistant(get_session_token_id()) 
  AND invoice_id IN (
    SELECT id FROM public.invoices 
    WHERE hidden_from_assistant = false
  )
);

DROP POLICY IF EXISTS "Assistants can delete documents" ON public.invoice_documents;

CREATE POLICY "Assistants can delete documents"
ON public.invoice_documents
FOR DELETE
TO authenticated
USING (
  is_assistant(get_session_token_id()) 
  AND invoice_id IN (
    SELECT id FROM public.invoices 
    WHERE hidden_from_assistant = false
  )
);

-- Same for client_payments
DROP POLICY IF EXISTS "Assistants can view all client payments" ON public.client_payments;

CREATE POLICY "Assistants can view all client payments"
ON public.client_payments
FOR SELECT
TO authenticated
USING (
  is_assistant(get_session_token_id()) 
  AND invoice_id IN (
    SELECT id FROM public.invoices 
    WHERE hidden_from_assistant = false
  )
);

DROP POLICY IF EXISTS "Assistants can insert client payments" ON public.client_payments;

CREATE POLICY "Assistants can insert client payments"
ON public.client_payments
FOR INSERT
TO authenticated
WITH CHECK (
  is_assistant(get_session_token_id()) 
  AND invoice_id IN (
    SELECT id FROM public.invoices 
    WHERE hidden_from_assistant = false
  )
);