// Utility functions for invoice calculations

// All scheme types from database
export type InvoiceScheme = 'partner_10' | 'partner_15' | 'agency_30' | 'agency_40' | 'commission_based';

export interface InvoiceCalculations {
  client_bill: number;
  commission_rate?: number;
  commission_amount?: number;
  amount_to_admin?: number;
  agency_margin?: number;
  partner_share_from_margin?: number;
  admin_share_from_margin?: number;
  client_base_after_margin?: number;
  client_spent?: number;
  client_remaining?: number;
  executor_expenses_total: number;
  partner_transfer_due: number;
  net_profit_admin: number;
  admin_share_50: number;
  cat_share_50: number;
  tax_amount?: number;
  amount_after_tax?: number;
}

/**
 * Calculate invoice financial metrics
 * 
 * @param scheme - Commission scheme type
 * @param clientBill - Total amount client pays
 * @param partnerCommissionRate - Custom commission rate (for commission_based scheme)
 * @param executorExpenses - Total executor expenses (for reference)
 * @param expensesPaidByPartner - Expenses paid by partner from client money (for display only)
 * @param expensesPaidByAdmin - Expenses paid by admin from own funds
 * @param plannedExpenses - Reserved amount for expenses (резерв)
 * 
 * CRITICAL BUSINESS RULE:
 * For partner schemes (partner_10, partner_15, commission_based):
 *   - partnerTransferDue = clientBill - commissionAmount - plannedExpenses (FIXED!)
 *   - This value does NOT change when expenses are added!
 *   - Expenses only reduce the "remaining reserve" display (plannedExpenses - expensesPaidByPartner)
 *   - Admin net profit = partnerTransferDue - expensesPaidByAdmin
 * 
 * For agency_30:
 *   - 70% stays with partner for project expenses
 *   - 30% is agency margin (15% partner + 15% admin)
 *   - Admin's 15% is FIXED, not affected by expenses (they come from 70%)
 */
export function calculateInvoice(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommissionRate?: number,
  executorExpenses: number = 0,
  expensesPaidByPartner: number = 0,
  expensesPaidByAdmin: number = 0,
  plannedExpenses: number = 0
): InvoiceCalculations {
  let calculations: InvoiceCalculations = {
    client_bill: clientBill,
    executor_expenses_total: executorExpenses,
    partner_transfer_due: 0,
    net_profit_admin: 0,
    admin_share_50: 0,
    cat_share_50: 0,
  };

  switch (scheme) {
    case 'agency_30': {
      // Схема: Маржа агентства 30%
      // Клиент платит: X
      // Комиссия агентства (30%): X × 0.30
      //   ├─ Партнеру (15%): X × 0.15
      //   └─ Админу (15%): X × 0.15
      // Средства клиента для трат: X × 0.70 (расходы идут отсюда!)
      // Долг партнёра = 15% (фиксировано)
      // Чистая прибыль админа = 15% (ФИКСИРОВАННАЯ, расходы идут из 70% клиента)
      
      const agencyMargin = clientBill * 0.30;
      const partnerShare = clientBill * 0.15; // Партнеру 15%
      const adminShare = clientBill * 0.15;   // Админу 15%
      const clientBase = clientBill * 0.70;
      const clientRemaining = clientBase - executorExpenses;
      const partnerTransferDue = adminShare; // Долг партнёра = 15%
      const netProfitAdmin = adminShare; // Прибыль = 15% (расходы из 70% клиента)
      
      calculations = {
        ...calculations,
        agency_margin: agencyMargin,
        partner_share_from_margin: partnerShare,
        admin_share_from_margin: adminShare,
        client_base_after_margin: clientBase,
        client_spent: executorExpenses,
        client_remaining: clientRemaining,
        partner_transfer_due: partnerTransferDue,
        net_profit_admin: netProfitAdmin,
        admin_share_50: netProfitAdmin / 2,
        cat_share_50: netProfitAdmin / 2,
      };
      break;
    }

    case 'agency_40': {
      // Схема: Маржа агентства 40%
      // Клиент платит: X
      // Комиссия агентства (40%): X × 0.40
      //   ├─ Партнеру (16%): X × 0.16
      //   └─ Админу (24%): X × 0.24
      // Средства клиента для трат: X × 0.60 (расходы идут отсюда!)
      // Долг партнёра = 24% (фиксировано)
      // Чистая прибыль админа = 24% (ФИКСИРОВАННАЯ, расходы идут из 60% клиента)
      
      const agencyMargin = clientBill * 0.40;
      const partnerShare = clientBill * 0.16; // Партнеру 16%
      const adminShare = clientBill * 0.24;   // Админу 24%
      const clientBase = clientBill * 0.60;
      const clientRemaining = clientBase - executorExpenses;
      const partnerTransferDue = adminShare; // Долг партнёра = 24%
      const netProfitAdmin = adminShare; // Прибыль = 24% (расходы из 60% клиента)
      
      calculations = {
        ...calculations,
        agency_margin: agencyMargin,
        partner_share_from_margin: partnerShare,
        admin_share_from_margin: adminShare,
        client_base_after_margin: clientBase,
        client_spent: executorExpenses,
        client_remaining: clientRemaining,
        partner_transfer_due: partnerTransferDue,
        net_profit_admin: netProfitAdmin,
        admin_share_50: netProfitAdmin / 2,
        cat_share_50: netProfitAdmin / 2,
      };
      break;
    }

    case 'partner_10': {
      // Схема: Комиссия партнера 10%
      // Долг партнёра:
      // - С резервом: ФИКСИРОВАННЫЙ = amountToAdmin - plannedExpenses
      // - Без резерва: уменьшается с расходами
      
      const commissionRate = 10;
      const commissionAmount = clientBill * 0.10;
      const amountToAdmin = clientBill * 0.90;
      const partnerTransferDue = plannedExpenses > 0
        ? Math.max(0, amountToAdmin - plannedExpenses)
        : Math.max(0, amountToAdmin - expensesPaidByPartner);
      const netProfitAdmin = partnerTransferDue - expensesPaidByAdmin;
      
      calculations = {
        ...calculations,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        amount_to_admin: amountToAdmin,
        partner_transfer_due: partnerTransferDue,
        net_profit_admin: netProfitAdmin,
        admin_share_50: netProfitAdmin / 2,
        cat_share_50: netProfitAdmin / 2,
      };
      break;
    }

    case 'partner_15': {
      // Схема: Комиссия партнера 15%
      // Долг партнёра:
      // - С резервом: ФИКСИРОВАННЫЙ = amountToAdmin - plannedExpenses
      // - Без резерва: уменьшается с расходами
      
      const commissionRate = 15;
      const commissionAmount = clientBill * 0.15;
      const amountToAdmin = clientBill * 0.85;
      const partnerTransferDue = plannedExpenses > 0
        ? Math.max(0, amountToAdmin - plannedExpenses)
        : Math.max(0, amountToAdmin - expensesPaidByPartner);
      const netProfitAdmin = partnerTransferDue - expensesPaidByAdmin;
      
      calculations = {
        ...calculations,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        amount_to_admin: amountToAdmin,
        partner_transfer_due: partnerTransferDue,
        net_profit_admin: netProfitAdmin,
        admin_share_50: netProfitAdmin / 2,
        cat_share_50: netProfitAdmin / 2,
      };
      break;
    }

    case 'commission_based': {
      // Универсальная схема с произвольной комиссией
      // Долг партнёра:
      // - С резервом: ФИКСИРОВАННЫЙ = amountToAdmin - plannedExpenses
      // - Без резерва: уменьшается с расходами
      // ВАЖНО: По умолчанию 0% комиссия (вся сумма идёт админу)
      
      const commissionRate = partnerCommissionRate ?? 0;
      const commissionAmount = clientBill * (commissionRate / 100);
      const amountToAdmin = clientBill - commissionAmount;
      const partnerTransferDue = plannedExpenses > 0
        ? Math.max(0, amountToAdmin - plannedExpenses)
        : Math.max(0, amountToAdmin - expensesPaidByPartner);
      const netProfitAdmin = partnerTransferDue - expensesPaidByAdmin;
      
      calculations = {
        ...calculations,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        amount_to_admin: amountToAdmin,
        partner_transfer_due: partnerTransferDue,
        net_profit_admin: netProfitAdmin,
        admin_share_50: netProfitAdmin / 2,
        cat_share_50: netProfitAdmin / 2,
      };
      break;
    }

    default: {
      // Fallback: treat as commission_based with 0% (вся сумма админу)
      const commissionRate = partnerCommissionRate ?? 0;
      const commissionAmount = clientBill * (commissionRate / 100);
      const amountToAdmin = clientBill - commissionAmount;
      const partnerTransferDue = plannedExpenses > 0
        ? Math.max(0, amountToAdmin - plannedExpenses)
        : Math.max(0, amountToAdmin - expensesPaidByPartner);
      const netProfitAdmin = partnerTransferDue - expensesPaidByAdmin;
      
      calculations = {
        ...calculations,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        amount_to_admin: amountToAdmin,
        partner_transfer_due: partnerTransferDue,
        net_profit_admin: netProfitAdmin,
        admin_share_50: netProfitAdmin / 2,
        cat_share_50: netProfitAdmin / 2,
      };
    }
  }

  return calculations;
}

/**
 * Calculates partner debt to admin based on scheme
 * 
 * IMPORTANT: When possible, use stored `partnerTransferDue` from invoice_calculations
 * table as the single source of truth. This function should only be used:
 * - When creating new invoices (no stored value yet)
 * - As fallback when stored value is unavailable
 * 
 * @param storedPartnerTransferDue - Use this if available from database
 * @param expensesPaidByPartner - expenses paid from client money (by partner)
 * @param expensesPaidByAdmin - expenses paid by admin from own funds
 */
export function calculatePartnerDebt(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommission: number,
  expensesPaidByPartner: number = 0,
  expensesPaidByAdmin: number = 0,
  storedPartnerTransferDue?: number
): { debtToAdmin: number; doNotSpendAmount: number; adminNetAfterOwnExpenses: number } {
  const totalExpenses = expensesPaidByPartner + expensesPaidByAdmin;
  
  if (scheme === 'agency_30') {
    // Agency 30%: 
    // - Partner keeps 15% (their share)
    // - Partner OWES admin 15% (admin's share)
    // - 70% is client budget for expenses (stays with partner for external services)
    const adminShare = clientBill * 0.15; // Admin's 15% - THIS is what partner owes
    const clientBase = clientBill * 0.70;
    const doNotSpendAmount = Math.max(0, clientBase - totalExpenses);
    
    // Use stored value if available, otherwise calculate
    const debtToAdmin = storedPartnerTransferDue !== undefined 
      ? Math.max(0, storedPartnerTransferDue) 
      : adminShare;
    
    return {
      debtToAdmin,
      doNotSpendAmount,
      adminNetAfterOwnExpenses: debtToAdmin - expensesPaidByAdmin,
    };
  }
  
  // Partner Agreement (partner_10, partner_15, commission_based):
  // 1. Client pays partner
  // 2. Partner pays expenses from client money (unless admin paid)
  // 3. Partner transfers remainder to admin
  
  let calculatedDebt: number;
  
  if (storedPartnerTransferDue !== undefined) {
    // Use stored value from database (single source of truth)
    calculatedDebt = storedPartnerTransferDue;
  } else {
    // Calculate fresh (for new invoices or fallback)
    let commissionRate: number;
    if (scheme === 'partner_10') {
      commissionRate = 10;
    } else if (scheme === 'partner_15') {
      commissionRate = 15;
    } else {
      // По умолчанию 0% - вся сумма идёт админу
      commissionRate = clientBill > 0 ? (partnerCommission / clientBill) * 100 : 0;
    }
    const commissionAmount = clientBill * (commissionRate / 100);
    calculatedDebt = clientBill - commissionAmount - expensesPaidByPartner;
  }
  
  // Clamp debt to zero (cannot be negative)
  const debtToAdmin = Math.max(0, calculatedDebt);
  
  // Admin's actual profit = what they receive - expenses they paid themselves
  const adminNetAfterOwnExpenses = debtToAdmin - expensesPaidByAdmin;
  
  return {
    debtToAdmin,
    doNotSpendAmount: 0, // No separate "do not spend" pool for commission-based schemes
    adminNetAfterOwnExpenses,
  };
}

export function formatCurrency(amount: number): string {
  // Форматирование числа с пробелами в качестве разделителей тысяч
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  
  // Добавляем символ рубля с неразрывным пробелом
  return `${formatted} ₽`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function getSchemeLabel(
  scheme: InvoiceScheme, 
  role?: 'admin' | 'assistant' | 'partner' | 'client',
  commissionRate?: number
): string {
  switch (scheme) {
    case 'agency_30':
      return 'Агентство 30%';
    case 'agency_40':
      return 'Агентство 40%';
    case 'partner_10':
      return 'Партнер 10%';
    case 'partner_15':
      return 'Партнер 15%';
    case 'commission_based':
      if (commissionRate) {
        return `Партнер ${commissionRate}%`;
      }
      return 'Партнерское соглашение';
    default:
      return String(scheme);
  }
}
