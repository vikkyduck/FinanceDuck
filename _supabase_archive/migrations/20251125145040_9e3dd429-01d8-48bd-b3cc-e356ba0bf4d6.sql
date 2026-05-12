-- Fix net_profit_admin calculation for commission_based scheme
-- Current issue: net_profit_admin subtracts only client expenses instead of total expenses
-- This causes incorrect admin_share_50 and cat_share_50 calculations

CREATE OR REPLACE FUNCTION recalculate_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_bill numeric := 0;
  v_scheme invoice_scheme;
  v_commission_rate numeric := 0;
  v_total_expenses numeric := 0;
  v_client_expenses numeric := 0;
  v_admin_expenses numeric := 0;
  
  -- Commission-based fields
  v_commission_amount numeric := 0;
  v_amount_to_admin numeric := 0;
  v_net_profit_admin numeric := 0;
  
  -- Agency 30% fields
  v_agency_margin numeric := 0;
  v_partner_share numeric := 0;
  v_admin_share numeric := 0;
  v_client_base numeric := 0;
  v_client_remaining numeric := 0;
  
  -- Shared fields
  v_admin_share_50 numeric := 0;
  v_cat_share_50 numeric := 0;
BEGIN
  -- Get invoice scheme and commission rate
  SELECT scheme, partner_commission_rate INTO v_scheme, v_commission_rate
  FROM invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Get total expenses for this invoice
  SELECT 
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(CASE WHEN COALESCE(is_admin_expense, false) = false THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(is_admin_expense, false) = true THEN amount ELSE 0 END), 0)
  INTO v_total_expenses, v_client_expenses, v_admin_expenses
  FROM executor_expenses
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Get or calculate client_bill from invoice_calculations
  SELECT COALESCE(client_bill, 0) INTO v_client_bill
  FROM invoice_calculations
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- If no client_bill found, nothing to calculate
  IF v_client_bill = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate based on scheme
  IF v_scheme = 'commission_based' THEN
    -- Commission-based scheme calculations
    v_commission_rate := COALESCE(v_commission_rate, 10);
    v_commission_amount := v_client_bill * (v_commission_rate / 100.0);
    v_amount_to_admin := v_client_bill - v_commission_amount;
    
    -- FIXED: Subtract ALL expenses, not just client expenses
    v_net_profit_admin := (v_client_bill - v_commission_amount) - v_total_expenses;
    
    v_admin_share_50 := v_net_profit_admin / 2.0;
    v_cat_share_50 := v_net_profit_admin / 2.0;
    
    -- Update calculations
    UPDATE invoice_calculations
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
    WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);
    
  ELSIF v_scheme = 'agency_30' THEN
    -- Agency 30% scheme calculations
    v_agency_margin := v_client_bill * 0.30;
    v_partner_share := v_client_bill * 0.15;
    v_admin_share := v_client_bill * 0.15;
    v_client_base := v_client_bill * 0.70;
    v_client_remaining := v_client_base - v_total_expenses;
    
    v_admin_share_50 := v_admin_share / 2.0;
    v_cat_share_50 := v_admin_share / 2.0;
    
    -- Update calculations
    UPDATE invoice_calculations
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
    WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;