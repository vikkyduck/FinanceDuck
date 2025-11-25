-- Update recalculate_all_invoices to properly recompute invoice_calculations using latest logic
CREATE OR REPLACE FUNCTION public.recalculate_all_invoices(_invoice_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(recalculated_count integer, success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_invoice RECORD;
  v_client_bill numeric;
  v_scheme invoice_scheme;
  v_commission_rate numeric;
  v_total_expenses numeric;
  v_client_expenses numeric;
  v_admin_expenses numeric;
  v_commission_amount numeric;
  v_amount_to_admin numeric;
  v_net_profit_admin numeric;
  v_agency_margin numeric;
  v_partner_share numeric;
  v_admin_share numeric;
  v_client_base numeric;
  v_client_remaining numeric;
  v_admin_share_50 numeric;
  v_cat_share_50 numeric;
BEGIN
  -- Helper to recalc a single invoice inline
  PERFORM 1; -- no-op to keep structure

  IF _invoice_id IS NOT NULL THEN
    FOR v_invoice IN SELECT * FROM invoices WHERE id = _invoice_id LOOP
      -- Get current calculation basics
      SELECT ic.client_bill INTO v_client_bill
      FROM invoice_calculations ic
      WHERE ic.invoice_id = v_invoice.id;

      IF v_client_bill IS NULL OR v_client_bill = 0 THEN
        CONTINUE;
      END IF;

      v_scheme := v_invoice.scheme;
      v_commission_rate := COALESCE(v_invoice.partner_commission_rate, 0);

      -- Aggregate expenses
      SELECT 
        COALESCE(SUM(amount), 0),
        COALESCE(SUM(CASE WHEN COALESCE(is_admin_expense, false) = false THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN COALESCE(is_admin_expense, false) = true THEN amount ELSE 0 END), 0)
      INTO v_total_expenses, v_client_expenses, v_admin_expenses
      FROM executor_expenses
      WHERE invoice_id = v_invoice.id;

      IF v_scheme = 'commission_based' THEN
        v_commission_rate := COALESCE(v_commission_rate, 10);
        v_commission_amount := v_client_bill * (v_commission_rate / 100.0);
        v_amount_to_admin := v_client_bill - v_commission_amount;
        v_net_profit_admin := (v_client_bill - v_commission_amount) - v_total_expenses;
        v_admin_share_50 := v_net_profit_admin / 2.0;
        v_cat_share_50 := v_net_profit_admin / 2.0;

        UPDATE invoice_calculations ic
        SET
          commission_rate = v_commission_rate,
          commission_amount = v_commission_amount,
          amount_to_admin = v_amount_to_admin,
          executor_expenses_total = v_total_expenses,
          client_spent = v_client_expenses,
          net_profit_admin = v_net_profit_admin,
          admin_share_50 = v_admin_share_50,
          cat_share_50 = v_cat_share_50,
          updated_at = now()
        WHERE ic.invoice_id = v_invoice.id;

      ELSIF v_scheme = 'agency_30' THEN
        v_agency_margin := v_client_bill * 0.30;
        v_partner_share := v_client_bill * 0.15;
        v_admin_share := v_client_bill * 0.15;
        v_client_base := v_client_bill * 0.70;
        v_client_remaining := v_client_base - v_total_expenses;
        v_admin_share_50 := v_admin_share / 2.0;
        v_cat_share_50 := v_admin_share / 2.0;

        UPDATE invoice_calculations ic
        SET
          agency_margin = v_agency_margin,
          partner_share_from_margin = v_partner_share,
          admin_share_from_margin = v_admin_share,
          client_base_after_margin = v_client_base,
          executor_expenses_total = v_total_expenses,
          client_spent = v_client_expenses,
          client_remaining = v_client_remaining,
          net_profit_admin = v_admin_share,
          admin_share_50 = v_admin_share_50,
          cat_share_50 = v_cat_share_50,
          updated_at = now()
        WHERE ic.invoice_id = v_invoice.id;
      END IF;

      v_count := v_count + 1;
    END LOOP;

    RETURN QUERY SELECT v_count, true, format('Invoice %s recalculated', _invoice_id)::TEXT;
    RETURN;
  END IF;

  -- Recalculate all invoices
  FOR v_invoice IN SELECT * FROM invoices ORDER BY created_at LOOP
    -- Same logic as above but for all invoices
    SELECT ic.client_bill INTO v_client_bill
    FROM invoice_calculations ic
    WHERE ic.invoice_id = v_invoice.id;

    IF v_client_bill IS NULL OR v_client_bill = 0 THEN
      CONTINUE;
    END IF;

    v_scheme := v_invoice.scheme;
    v_commission_rate := COALESCE(v_invoice.partner_commission_rate, 0);

    SELECT 
      COALESCE(SUM(amount), 0),
      COALESCE(SUM(CASE WHEN COALESCE(is_admin_expense, false) = false THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN COALESCE(is_admin_expense, false) = true THEN amount ELSE 0 END), 0)
    INTO v_total_expenses, v_client_expenses, v_admin_expenses
    FROM executor_expenses
    WHERE invoice_id = v_invoice.id;

    IF v_scheme = 'commission_based' THEN
      v_commission_rate := COALESCE(v_commission_rate, 10);
      v_commission_amount := v_client_bill * (v_commission_rate / 100.0);
      v_amount_to_admin := v_client_bill - v_commission_amount;
      v_net_profit_admin := (v_client_bill - v_commission_amount) - v_total_expenses;
      v_admin_share_50 := v_net_profit_admin / 2.0;
      v_cat_share_50 := v_net_profit_admin / 2.0;

      UPDATE invoice_calculations ic
      SET
        commission_rate = v_commission_rate,
        commission_amount = v_commission_amount,
        amount_to_admin = v_amount_to_admin,
        executor_expenses_total = v_total_expenses,
        client_spent = v_client_expenses,
        net_profit_admin = v_net_profit_admin,
        admin_share_50 = v_admin_share_50,
        cat_share_50 = v_cat_share_50,
        updated_at = now()
      WHERE ic.invoice_id = v_invoice.id;

    ELSIF v_scheme = 'agency_30' THEN
      v_agency_margin := v_client_bill * 0.30;
      v_partner_share := v_client_bill * 0.15;
      v_admin_share := v_client_bill * 0.15;
      v_client_base := v_client_bill * 0.70;
      v_client_remaining := v_client_base - v_total_expenses;
      v_admin_share_50 := v_admin_share / 2.0;
      v_cat_share_50 := v_admin_share / 2.0;

      UPDATE invoice_calculations ic
      SET
        agency_margin = v_agency_margin,
        partner_share_from_margin = v_partner_share,
        admin_share_from_margin = v_admin_share,
        client_base_after_margin = v_client_base,
        executor_expenses_total = v_total_expenses,
        client_spent = v_client_expenses,
        client_remaining = v_client_remaining,
        net_profit_admin = v_admin_share,
        admin_share_50 = v_admin_share_50,
        cat_share_50 = v_cat_share_50,
        updated_at = now()
      WHERE ic.invoice_id = v_invoice.id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count, true, format('Successfully recalculated %s invoices', v_count)::TEXT;
END;
$function$;