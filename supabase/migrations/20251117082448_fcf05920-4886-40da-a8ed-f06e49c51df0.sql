-- 1. Добавить новые поля
ALTER TABLE invoices ADD COLUMN partner_commission_rate numeric;
ALTER TABLE partner_payments ADD COLUMN invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

-- 2. Мигрировать существующие данные в partner_commission_rate
UPDATE invoices 
SET partner_commission_rate = CASE
  WHEN scheme = 'partner_10' THEN 10
  WHEN scheme = 'partner_15' THEN 15
  WHEN scheme = 'vika_ie_7' THEN 7
  ELSE NULL
END;

-- 3. Создать новый enum с обоими старыми и новыми значениями
CREATE TYPE invoice_scheme_new AS ENUM ('agency_30', 'commission_based', 'partner_10', 'partner_15', 'vika_ie_7');

-- 4. Обновить столбец на новый enum
ALTER TABLE invoices ALTER COLUMN scheme TYPE invoice_scheme_new USING scheme::text::invoice_scheme_new;

-- 5. Удалить старый enum
DROP TYPE invoice_scheme;

-- 6. Переименовать новый enum
ALTER TYPE invoice_scheme_new RENAME TO invoice_scheme;

-- 7. Теперь обновить значения на упрощенные схемы
UPDATE invoices 
SET scheme = 'commission_based'::invoice_scheme
WHERE scheme IN ('partner_10'::invoice_scheme, 'partner_15'::invoice_scheme, 'vika_ie_7'::invoice_scheme);

-- 8. Создать финальный enum только с двумя значениями
CREATE TYPE invoice_scheme_final AS ENUM ('agency_30', 'commission_based');

-- 9. Обновить столбец на финальный enum
ALTER TABLE invoices ALTER COLUMN scheme TYPE invoice_scheme_final USING scheme::text::invoice_scheme_final;

-- 10. Удалить промежуточный enum
DROP TYPE invoice_scheme;

-- 11. Переименовать финальный enum
ALTER TYPE invoice_scheme_final RENAME TO invoice_scheme;

-- 12. Создать таблицу для отслеживания платежей от клиентов (водопад)
CREATE TABLE client_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_date date NOT NULL,
  payment_method text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 13. Добавить индексы для производительности
CREATE INDEX idx_client_payments_invoice ON client_payments(invoice_id);
CREATE INDEX idx_client_payments_date ON client_payments(payment_date);
CREATE INDEX idx_partner_payments_partner ON partner_payments(partner_id);
CREATE INDEX idx_partner_payments_invoice ON partner_payments(invoice_id);

-- 14. Включить RLS для client_payments
ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;

-- 15. RLS политики для client_payments
CREATE POLICY "Anyone can view client payments"
ON client_payments
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert client payments"
ON client_payments
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete client payments"
ON client_payments
FOR DELETE
TO authenticated
USING (true);