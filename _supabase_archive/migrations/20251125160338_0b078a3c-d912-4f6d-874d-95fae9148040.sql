-- Сначала удаляем старую функцию
DROP FUNCTION IF EXISTS public.recalculate_all_invoices(uuid);

-- Создаём новую версию без зависимости от триггеров
CREATE OR REPLACE FUNCTION public.recalculate_all_invoices(_invoice_id UUID DEFAULT NULL)
RETURNS TABLE(success BOOLEAN, recalculated_count INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER := 0;
  v_invoice RECORD;
  v_client_bill NUMERIC;
  v_scheme invoice_scheme;
  v_commission_rate NUMERIC;
  v_total_expenses NUMERIC;
  
  -- Commission-based fields
  v_commission_amount NUMERIC;
  v_amount_to_admin NUMERIC;
  v_net_profit_admin NUMERIC;
  
  -- Agency 30% fields
  v_agency_margin NUMERIC;
  v_partner_share NUMERIC;
  v_admin_share NUMERIC;
  v_client_base NUMERIC;
  v_client_remaining NUMERIC;
  
  -- Shared fields
  v_admin_share_50 NUMERIC;
  v_cat_share_50 NUMERIC;
BEGIN
  -- Если указан конкретный счёт, обрабатываем только его, иначе все
  FOR v_invoice IN
    SELECT i.id, i.scheme, i.partner_commission_rate, ic.client_bill
    FROM invoices i
    LEFT JOIN invoice_calculations ic ON ic.invoice_id = i.id
    WHERE (_invoice_id IS NULL OR i.id = _invoice_id)
  LOOP
    -- Пропускаем, если нет client_bill
    IF v_invoice.client_bill IS NULL OR v_invoice.client_bill = 0 THEN
      CONTINUE;
    END IF;
    
    v_client_bill := v_invoice.client_bill;
    v_scheme := v_invoice.scheme;
    v_commission_rate := COALESCE(v_invoice.partner_commission_rate, 10);
    
    -- Считаем общую сумму расходов
    SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
    FROM executor_expenses
    WHERE invoice_id = v_invoice.id;
    
    -- Пересчитываем по схеме
    IF v_scheme = 'commission_based' THEN
      v_commission_amount := v_client_bill * (v_commission_rate / 100.0);
      v_amount_to_admin := v_client_bill - v_commission_amount;
      v_net_profit_admin := v_amount_to_admin - v_total_expenses;
      v_admin_share_50 := v_net_profit_admin / 2.0;
      v_cat_share_50 := v_net_profit_admin / 2.0;
      
      UPDATE invoice_calculations
      SET
        commission_rate = v_commission_rate,
        commission_amount = v_commission_amount,
        amount_to_admin = v_amount_to_admin,
        executor_expenses_total = v_total_expenses,
        client_spent = v_total_expenses,
        net_profit_admin = v_net_profit_admin,
        admin_share_50 = v_admin_share_50,
        cat_share_50 = v_cat_share_50,
        updated_at = now()
      WHERE invoice_id = v_invoice.id;
      
    ELSIF v_scheme = 'agency_30' THEN
      v_agency_margin := v_client_bill * 0.30;
      v_partner_share := v_client_bill * 0.15;
      v_admin_share := v_client_bill * 0.15;
      v_client_base := v_client_bill * 0.70;
      v_client_remaining := v_client_base - v_total_expenses;
      v_admin_share_50 := v_admin_share / 2.0;
      v_cat_share_50 := v_admin_share / 2.0;
      
      UPDATE invoice_calculations
      SET
        agency_margin = v_agency_margin,
        partner_share_from_margin = v_partner_share,
        admin_share_from_margin = v_admin_share,
        client_base_after_margin = v_client_base,
        executor_expenses_total = v_total_expenses,
        client_spent = v_total_expenses,
        client_remaining = v_client_remaining,
        net_profit_admin = v_admin_share,
        admin_share_50 = v_admin_share_50,
        cat_share_50 = v_cat_share_50,
        updated_at = now()
      WHERE invoice_id = v_invoice.id;
    END IF;
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT 
    TRUE, 
    v_count,
    CASE 
      WHEN v_count = 0 THEN 'Нет счетов для пересчёта'
      WHEN v_count = 1 THEN 'Пересчитан 1 счёт'
      ELSE 'Пересчитано счетов: ' || v_count::TEXT
    END;
END;
$$;