-- Обновление логики перерасчета для схемы "Агентство 30%"
CREATE OR REPLACE FUNCTION public.recalculate_invoice_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_scheme invoices.scheme%TYPE;
  v_client_bill numeric;
  v_partner_rate numeric;

  v_total_expenses numeric := 0;
  v_client_expenses numeric := 0;
  v_admin_expenses numeric := 0;

  v_client_base numeric := NULL;
  v_client_remaining numeric := NULL;

  v_agency_margin numeric := NULL;
  v_partner_share numeric := NULL;
  v_admin_share numeric := NULL;

  v_commission_rate numeric := NULL;
  v_commission_amount numeric := NULL;
  v_amount_to_admin numeric := NULL;

  v_net_profit_admin numeric := NULL;
BEGIN
  -- Определяем invoice_id для INSERT/UPDATE и DELETE
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Берем схему, ставку и сумму счета
  SELECT i.scheme,
         i.partner_commission_rate,
         ic.client_bill
  INTO v_scheme, v_partner_rate, v_client_bill
  FROM public.invoices i
  JOIN public.invoice_calculations ic ON ic.invoice_id = i.id
  WHERE i.id = v_invoice_id;

  -- Если почему-то нет расчета или суммы, просто выходим
  IF v_client_bill IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Суммируем траты исполнителей по счету
  SELECT 
    COALESCE(SUM(amount), 0) AS total_expenses,
    COALESCE(SUM(CASE WHEN COALESCE(is_admin_expense, false) THEN 0 ELSE amount END), 0) AS client_expenses,
    COALESCE(SUM(CASE WHEN COALESCE(is_admin_expense, false) THEN amount ELSE 0 END), 0) AS admin_expenses
  INTO v_total_expenses, v_client_expenses, v_admin_expenses
  FROM public.executor_expenses
  WHERE invoice_id = v_invoice_id;

  IF v_scheme = 'agency_30' THEN
    -- Схема Агентство 30%:
    -- Клиент платит X
    -- Маржа агентства (30%): X * 0.30
    --   ├─ Партнеру (15%): X * 0.15
    --   └─ Админу (15%): X * 0.15 (фиксированная чистая прибыль до собственных расходов админа)
    -- Бюджет клиента: X * 0.70
    -- Расходы исполнителей: списываются ТОЛЬКО из клиентских 70%
    
    v_agency_margin := v_client_bill * 0.30;
    v_partner_share := v_client_bill * 0.15;
    v_admin_share := v_client_bill * 0.15;

    v_client_base := v_client_bill * 0.70;
    v_client_remaining := v_client_base - v_client_expenses;

    -- Чистая прибыль админа: фиксированные 15% минус его личные расходы (если есть is_admin_expense)
    v_net_profit_admin := v_admin_share - v_admin_expenses;

    v_commission_rate := NULL;
    v_commission_amount := NULL;
    -- Партнер должен перечислить админу его 15% от счета
    v_amount_to_admin := v_admin_share;
  ELSE
    -- Схема commission_based (10%/15% комиссия партнера):
    -- Клиент платит: X
    -- Комиссия партнера: X * (rate / 100)
    -- Партнер переводит админу: X - комиссия
    -- Расходы на исполнителей (Y) уменьшают прибыль админа
    v_commission_rate := COALESCE(v_partner_rate, 10);
    v_commission_amount := v_client_bill * (v_commission_rate / 100.0);
    v_amount_to_admin := v_client_bill - v_commission_amount;

    v_agency_margin := NULL;
    v_partner_share := NULL;
    v_admin_share := NULL;
    v_client_base := NULL;
    v_client_remaining := NULL;

    v_net_profit_admin := v_amount_to_admin - v_total_expenses;
  END IF;

  UPDATE public.invoice_calculations
  SET
    executor_expenses_total   = v_total_expenses,
    client_spent              = v_client_expenses,
    client_base_after_margin  = v_client_base,
    client_remaining          = v_client_remaining,
    agency_margin             = v_agency_margin,
    partner_share_from_margin = v_partner_share,
    admin_share_from_margin   = v_admin_share,
    commission_rate           = v_commission_rate,
    commission_amount         = v_commission_amount,
    amount_to_admin           = v_amount_to_admin,
    net_profit_admin          = v_net_profit_admin,
    admin_share_50            = CASE WHEN v_net_profit_admin IS NOT NULL THEN v_net_profit_admin / 2 ELSE NULL END,
    cat_share_50              = CASE WHEN v_net_profit_admin IS NOT NULL THEN v_net_profit_admin / 2 ELSE NULL END,
    updated_at                = now()
  WHERE invoice_id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;