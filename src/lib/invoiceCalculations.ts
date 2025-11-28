// Utility functions for invoice calculations

// All scheme types from database
export type InvoiceScheme = 'partner_10' | 'partner_15' | 'agency_30' | 'commission_based';

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
  net_profit_admin: number;
  admin_share_50: number;
  cat_share_50: number;
  tax_amount?: number;
  amount_after_tax?: number;
}

export function calculateInvoice(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommissionRate?: number,
  executorExpenses: number = 0
): InvoiceCalculations {
  let calculations: InvoiceCalculations = {
    client_bill: clientBill,
    executor_expenses_total: executorExpenses,
    net_profit_admin: 0,
    admin_share_50: 0,
    cat_share_50: 0,
  };

  switch (scheme) {
    case 'agency_30': {
      // Схема 3: Маржа агентства 30%
      // Клиент платит: X
      // Комиссия агентства (30%): X × 0.30
      //   ├─ Партнеру (15%): X × 0.15
      //   └─ Админу (15%): X × 0.15
      // Средства клиента для трат: X × 0.70
      // Остаток клиента: (X × 0.70) - Y
      // Чистая прибыль админа: X × 0.15 (ФИКСИРОВАННАЯ!)
      
      const agencyMargin = clientBill * 0.30;
      const partnerShare = clientBill * 0.15; // Партнеру 15%
      const adminShare = clientBill * 0.15;   // Админу 15%
      const clientBase = clientBill * 0.70;
      const clientRemaining = clientBase - executorExpenses;
      
      calculations = {
        ...calculations,
        agency_margin: agencyMargin,
        partner_share_from_margin: partnerShare,
        admin_share_from_margin: adminShare,
        client_base_after_margin: clientBase,
        client_spent: executorExpenses,
        client_remaining: clientRemaining,
        net_profit_admin: adminShare, // Фиксированная: X × 0.15
        admin_share_50: adminShare / 2,
        cat_share_50: adminShare / 2,
      };
      break;
    }

    case 'partner_10': {
      // Схема 1: Комиссия партнера 10%
      // Клиент платит: X
      // Комиссия партнера: X × 0.10
      // Партнер переводит админу: X × 0.90
      // ВАЖНО: Расходы оплачиваются партнером из денег клиента
      // Чистая прибыль админа: X × 0.90 (ФИКСИРОВАННАЯ, расходы - проблема партнера)
      
      const commissionRate = 10;
      const commissionAmount = clientBill * 0.10;
      const amountToAdmin = clientBill * 0.90;
      // netProfitAdmin = amountToAdmin (расходы не вычитаются - они оплачиваются партнером)
      const netProfitAdmin = amountToAdmin;
      
      calculations = {
        ...calculations,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        amount_to_admin: amountToAdmin,
        net_profit_admin: netProfitAdmin,
        admin_share_50: netProfitAdmin / 2,
        cat_share_50: netProfitAdmin / 2,
      };
      break;
    }

    case 'partner_15': {
      // Схема 2: Комиссия партнера 15%
      // Клиент платит: X
      // Комиссия партнера: X × 0.15
      // Партнер переводит админу: X × 0.85
      // ВАЖНО: Расходы оплачиваются партнером из денег клиента
      // Чистая прибыль админа: X × 0.85 (ФИКСИРОВАННАЯ, расходы - проблема партнера)
      
      const commissionRate = 15;
      const commissionAmount = clientBill * 0.15;
      const amountToAdmin = clientBill * 0.85;
      // netProfitAdmin = amountToAdmin (расходы не вычитаются - они оплачиваются партнером)
      const netProfitAdmin = amountToAdmin;
      
      calculations = {
        ...calculations,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        amount_to_admin: amountToAdmin,
        net_profit_admin: netProfitAdmin,
        admin_share_50: netProfitAdmin / 2,
        cat_share_50: netProfitAdmin / 2,
      };
      break;
    }

    case 'commission_based': {
      // Универсальная схема с произвольной комиссией
      // Используется когда партнер имеет нестандартный процент
      // Клиент платит: X
      // Комиссия партнера: X × (rate / 100)
      // Партнер переводит админу: X × (1 - rate / 100)
      // ВАЖНО: Расходы оплачиваются партнером из денег клиента
      // Чистая прибыль админа: X × (1 - rate / 100) (ФИКСИРОВАННАЯ)
      
      const commissionRate = partnerCommissionRate || 10;
      const commissionAmount = clientBill * (commissionRate / 100);
      const amountToAdmin = clientBill - commissionAmount;
      // netProfitAdmin = amountToAdmin (расходы не вычитаются - они оплачиваются партнером)
      const netProfitAdmin = amountToAdmin;
      
      calculations = {
        ...calculations,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        amount_to_admin: amountToAdmin,
        net_profit_admin: netProfitAdmin,
        admin_share_50: netProfitAdmin / 2,
        cat_share_50: netProfitAdmin / 2,
      };
      break;
    }

    default: {
      // Fallback: treat as commission_based with 10%
      const commissionRate = partnerCommissionRate || 10;
      const commissionAmount = clientBill * (commissionRate / 100);
      const amountToAdmin = clientBill - commissionAmount;
      const netProfitAdmin = amountToAdmin;
      
      calculations = {
        ...calculations,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        amount_to_admin: amountToAdmin,
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
 * Partner Agreement (partner_10, partner_15, commission_based):
 *   Standard case (partner pays expenses from client money):
 *     debt = clientBill - partnerCommission - expensesPaidByPartner
 *   
 *   Exception (admin pays expenses):
 *     debt = clientBill - partnerCommission
 *     (Expenses paid by admin don't reduce partner's debt)
 *     Admin's net profit = received from partner - expenses paid by admin
 * 
 * Agency 30%:
 *   Client pays 100%
 *   ├─ 70% = client budget for project expenses (stays with partner)
 *   └─ 30% = agency margin, split 50/50:
 *       ├─ 15% partner share (partner keeps this)
 *       └─ 15% admin share (partner OWES this to admin)
 *   
 *   debt = admin_share_from_margin (15% of client bill)
 *   doNotSpendAmount = 70% of client bill - executor expenses
 * 
 * @param expensesPaidByPartner - expenses paid from client money (by partner)
 * @param expensesPaidByAdmin - expenses paid by admin from own funds
 */
export function calculatePartnerDebt(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommission: number,
  expensesPaidByPartner: number = 0,
  expensesPaidByAdmin: number = 0
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
    
    return {
      debtToAdmin: adminShare, // Partner owes admin their 15% share (fixed)
      doNotSpendAmount,
      adminNetAfterOwnExpenses: adminShare - expensesPaidByAdmin,
    };
  }
  
  // Partner Agreement (partner_10, partner_15, commission_based):
  // 1. Client pays partner
  // 2. Partner pays expenses from client money (unless admin paid)
  // 3. Partner transfers remainder to admin
  
  let commissionRate: number;
  if (scheme === 'partner_10') {
    commissionRate = 10;
  } else if (scheme === 'partner_15') {
    commissionRate = 15;
  } else {
    // commission_based - use provided rate
    commissionRate = (partnerCommission / clientBill) * 100 || 10;
  }
  
  const commissionAmount = clientBill * (commissionRate / 100);
  
  // Partner's debt = client bill - partner's commission - expenses paid by partner
  // If admin paid expenses, they are NOT deducted from partner's debt
  const debtToAdmin = clientBill - commissionAmount - expensesPaidByPartner;
  
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
