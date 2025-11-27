// Utility functions for invoice calculations

export type InvoiceScheme = 'agency_30' | 'commission_based';

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
      // Чистая прибыль админа: X × 0.15 (фиксированная!)
      
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

    case 'commission_based': {
      // Схема 1 и 2: Комиссия партнера (10% или 15%)
      // Клиент платит: X
      // Комиссия партнера: X × (rate / 100)
      // Партнер переводит админу: X × (1 - rate / 100)
      // Расходы на исполнителей: Y
      // Чистая прибыль админа: (X × (1 - rate / 100)) - Y
      
      const commissionRate = partnerCommissionRate || 10;
      const commissionAmount = clientBill * (commissionRate / 100);
      const amountToAdmin = clientBill - commissionAmount;
      const netProfitAdmin = amountToAdmin - executorExpenses;
      
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
  }

  return calculations;
}

/**
 * Calculates partner debt to admin based on scheme
 * 
 * Partner Agreement (commission_based):
 *   debt = clientBill - partnerCommission - executorExpenses
 *   (Partner pays expenses from client money)
 * 
 * Agency 30%:
 *   debt = partner_share_from_margin (15% of client bill)
 *   (Partner owes only their 15% commission, remaining 70% is separate)
 */
export function calculatePartnerDebt(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommission: number,
  executorExpenses: number = 0
): { debtToAdmin: number; doNotSpendAmount: number } {
  if (scheme === 'agency_30') {
    // Agency 30%: Partner owes only their 15% commission
    // The remaining 70% minus expenses is "DO NOT SPEND" money
    const clientBase = clientBill * 0.70;
    const doNotSpendAmount = Math.max(0, clientBase - executorExpenses);
    
    return {
      debtToAdmin: partnerCommission, // Just the 15% commission
      doNotSpendAmount,
    };
  }
  
  // Partner Agreement (commission_based):
  // Partner owes clientBill - their commission - expenses they paid
  const debtToAdmin = Math.max(0, clientBill - partnerCommission - executorExpenses);
  
  return {
    debtToAdmin,
    doNotSpendAmount: 0, // No "do not spend" pool for commission-based scheme
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
  if (scheme === 'agency_30') {
    return 'Агентство 30%';
  }
  
  if (scheme === 'commission_based') {
    // В заголовке показываем только тип схемы, без процента,
    // чтобы избежать дублирования с редактируемым полем.
    return 'Партнерское соглашение';
  }
  
  return scheme;
}
