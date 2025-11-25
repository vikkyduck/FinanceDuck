-- Включить RLS и создать политики для всех таблиц без защиты

-- 1. ACCESS_TOKENS: Все пользователи могут видеть и использовать коды доступа
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view access tokens"
ON access_tokens FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can use access tokens"
ON access_tokens FOR UPDATE
TO authenticated
USING (true);

-- 2. CLIENTS: Все пользователи могут видеть клиентов
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view clients"
ON clients FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create clients"
ON clients FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update clients"
ON clients FOR UPDATE
TO authenticated
USING (true);

-- 3. EXECUTOR_EXPENSES: Все пользователи могут управлять расходами
ALTER TABLE executor_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view expenses"
ON executor_expenses FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create expenses"
ON executor_expenses FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete expenses"
ON executor_expenses FOR DELETE
TO authenticated
USING (true);

-- 4. INVOICE_CALCULATIONS: Все пользователи могут видеть и обновлять расчеты
ALTER TABLE invoice_calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view calculations"
ON invoice_calculations FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create calculations"
ON invoice_calculations FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update calculations"
ON invoice_calculations FOR UPDATE
TO authenticated
USING (true);

-- 5. INVOICES: Все пользователи могут управлять счетами
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view invoices"
ON invoices FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create invoices"
ON invoices FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update invoices"
ON invoices FOR UPDATE
TO authenticated
USING (true);

-- 6. PARTNER_PAYMENTS: Все пользователи могут видеть платежи партнеров
ALTER TABLE partner_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view partner payments"
ON partner_payments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create partner payments"
ON partner_payments FOR INSERT
TO authenticated
WITH CHECK (true);

-- 7. PARTNERS: Все пользователи могут видеть партнеров
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view partners"
ON partners FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create partners"
ON partners FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update partners"
ON partners FOR UPDATE
TO authenticated
USING (true);

-- 8. USER_ROLES: Все пользователи могут видеть роли
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view user roles"
ON user_roles FOR SELECT
TO authenticated
USING (true);