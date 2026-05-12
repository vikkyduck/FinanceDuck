-- ============================================
-- PHASE 1: ОТКАТ С TRANSACTIONS НА INVOICES
-- ============================================

-- Удаляем таблицы transactions и projects (новая система)
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;

-- ============================================
-- PHASE 2: APPROVAL WORKFLOW ДЛЯ INVOICES
-- ============================================

-- Добавляем поля для approval workflow
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.access_tokens(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- Добавляем статус для ожидания approval
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t 
    JOIN pg_namespace n ON t.typnamespace = n.oid 
    WHERE t.typname = 'invoice_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.invoice_status AS ENUM ('draft', 'pending_approval', 'sent', 'paid', 'cancelled');
  ELSE
    ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'pending_approval' AFTER 'draft';
  END IF;
END $$;

-- ============================================
-- PHASE 3: RECONCILIATION СИСТЕМА
-- ============================================

-- Создаем таблицу для reconciliation записей
CREATE TABLE IF NOT EXISTS public.reconciliation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  
  -- Плановые суммы (из invoice_calculations)
  expected_client_payment NUMERIC NOT NULL,
  expected_partner_payment NUMERIC,
  
  -- Фактические суммы (из client_payments и partner_payments)
  actual_client_payment NUMERIC DEFAULT 0,
  actual_partner_payment NUMERIC DEFAULT 0,
  
  -- Расхождения
  client_variance NUMERIC GENERATED ALWAYS AS (actual_client_payment - expected_client_payment) STORED,
  partner_variance NUMERIC GENERATED ALWAYS AS (actual_partner_payment - COALESCE(expected_partner_payment, 0)) STORED,
  
  -- Статус reconciliation
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reconciled', 'disputed', 'resolved')),
  
  -- Кто и когда reconciled
  reconciled_by UUID REFERENCES public.access_tokens(id),
  reconciled_at TIMESTAMP WITH TIME ZONE,
  reconciliation_notes TEXT,
  
  -- Метаданные
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_reconciliation_invoice ON public.reconciliation_records(invoice_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON public.reconciliation_records(status);

-- Trigger для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_reconciliation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reconciliation_updated_at
  BEFORE UPDATE ON public.reconciliation_records
  FOR EACH ROW
  EXECUTE FUNCTION update_reconciliation_updated_at();

-- ============================================
-- PHASE 4: УЛУЧШЕННАЯ СИСТЕМА БОНУСОВ
-- ============================================

-- Добавляем поля для фактических выплат в assistant_bonuses
ALTER TABLE public.assistant_bonuses
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'paid', 'cancelled')),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.access_tokens(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES public.access_tokens(id),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_notes TEXT;

-- ============================================
-- PHASE 5: RLS POLICIES
-- ============================================

-- RLS для reconciliation_records
ALTER TABLE public.reconciliation_records ENABLE ROW LEVEL SECURITY;

-- Админы могут все
CREATE POLICY "Admins full access to reconciliation" 
  ON public.reconciliation_records 
  FOR ALL 
  USING (is_admin(get_session_token_id()))
  WITH CHECK (is_admin(get_session_token_id()));

-- Ассистенты могут просматривать
CREATE POLICY "Assistants can view reconciliation" 
  ON public.reconciliation_records 
  FOR SELECT 
  USING (is_assistant(get_session_token_id()));

-- Партнеры могут видеть reconciliation своих счетов
CREATE POLICY "Partners can view their reconciliation" 
  ON public.reconciliation_records 
  FOR SELECT 
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices 
      WHERE partner_id = get_token_partner_id(get_session_token_id())
    )
  );

-- ============================================
-- PHASE 6: ФУНКЦИИ ДЛЯ АВТОМАТИЗАЦИИ
-- ============================================

-- Функция для создания reconciliation записи при создании invoice_calculations
CREATE OR REPLACE FUNCTION create_reconciliation_record()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.reconciliation_records (
    invoice_id,
    expected_client_payment,
    expected_partner_payment
  ) VALUES (
    NEW.invoice_id,
    NEW.client_bill,
    CASE 
      WHEN NEW.partner_share_from_margin IS NOT NULL THEN NEW.partner_share_from_margin
      WHEN NEW.commission_amount IS NOT NULL THEN NEW.commission_amount
      ELSE 0
    END
  )
  ON CONFLICT (invoice_id) DO UPDATE SET
    expected_client_payment = EXCLUDED.expected_client_payment,
    expected_partner_payment = EXCLUDED.expected_partner_payment,
    updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger для автоматического создания reconciliation
DROP TRIGGER IF EXISTS trigger_create_reconciliation ON public.invoice_calculations;
CREATE TRIGGER trigger_create_reconciliation
  AFTER INSERT OR UPDATE ON public.invoice_calculations
  FOR EACH ROW
  EXECUTE FUNCTION create_reconciliation_record();

-- Функция для обновления фактических платежей
CREATE OR REPLACE FUNCTION update_reconciliation_actuals()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
  v_total_client NUMERIC;
  v_total_partner NUMERIC;
BEGIN
  -- Определяем invoice_id в зависимости от таблицы
  IF TG_TABLE_NAME = 'client_payments' THEN
    v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  ELSIF TG_TABLE_NAME = 'partner_payments' THEN
    v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  END IF;
  
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Пересчитываем суммы
  SELECT COALESCE(SUM(amount), 0) INTO v_total_client
  FROM public.client_payments
  WHERE invoice_id = v_invoice_id;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_total_partner
  FROM public.partner_payments
  WHERE invoice_id = v_invoice_id;
  
  -- Обновляем reconciliation
  UPDATE public.reconciliation_records
  SET 
    actual_client_payment = v_total_client,
    actual_partner_payment = v_total_partner,
    status = CASE
      WHEN ABS(v_total_client - expected_client_payment) < 0.01 
           AND ABS(v_total_partner - COALESCE(expected_partner_payment, 0)) < 0.01 
      THEN 'reconciled'
      ELSE 'pending'
    END,
    updated_at = now()
  WHERE invoice_id = v_invoice_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers для автоматического обновления reconciliation
DROP TRIGGER IF EXISTS trigger_update_reconciliation_client ON public.client_payments;
CREATE TRIGGER trigger_update_reconciliation_client
  AFTER INSERT OR UPDATE OR DELETE ON public.client_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_reconciliation_actuals();

DROP TRIGGER IF EXISTS trigger_update_reconciliation_partner ON public.partner_payments;
CREATE TRIGGER trigger_update_reconciliation_partner
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_reconciliation_actuals();

-- ============================================
-- КОММЕНТАРИИ
-- ============================================

COMMENT ON TABLE public.reconciliation_records IS 'Сверка плановых и фактических платежей по счетам';
COMMENT ON COLUMN public.reconciliation_records.client_variance IS 'Разница между фактической и ожидаемой оплатой клиента';
COMMENT ON COLUMN public.reconciliation_records.partner_variance IS 'Разница между фактической и ожидаемой выплатой партнеру';
COMMENT ON COLUMN public.assistant_bonuses.payment_status IS 'Статус выплаты бонуса: pending, approved, paid, cancelled';