-- Drop conflicting RLS policies for expenses
DROP POLICY IF EXISTS "Users can view expenses for accessible invoices" ON public.executor_expenses;
DROP POLICY IF EXISTS "Users can insert expenses for accessible invoices" ON public.executor_expenses;

-- Keep only these simple policies:
-- 1. "Assistants see all expenses" - allows SELECT for all expenses
-- 2. "Assistants modify all expenses" - allows ALL operations
-- 3. "Admins can view all expenses", "Admins can insert expenses", "Admins can delete expenses"
-- 4. "Partners can view expenses for their invoices"
-- 5. "Clients can view expenses for their invoices"

-- Verify assistant can see expenses for non-hidden invoices
COMMENT ON POLICY "Assistants see all expenses" ON public.executor_expenses IS 
'Ассистент видит все расходы, чтобы вносить их в систему. НЕ видит партнерские комиссии - это контролируется в коде через invoicePermissions.ts';