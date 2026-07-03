import { isAgencyScheme } from "./invoiceHelpers";

export type UserRole = 'assistant' | 'partner' | 'admin' | 'client' | 'accountant';
export type InvoiceScheme = 'agency_30' | 'agency_40' | 'commission_based' | 'agency';

export interface VisibleFields {
  // Basic info
  showBasicInfo: boolean;
  
  // Financial fields
  showClientBill: boolean;
  showCommissionDetails: boolean;
  showAgencyMargin: boolean;
  showClientBudget: boolean;
  showExpensesTotal: boolean;
  showClientRemaining: boolean;
  showPartnerShare: boolean;
  showAdminShare: boolean;
  showNetProfitAdmin: boolean;
  showAdminCatSplit: boolean;
  showAssistantBonus: boolean;
  
  // Actions
  canEditStatus: boolean;
  canEditPaymentDates: boolean;
  canEditNotes: boolean;
  canEditInvoiceNumber: boolean;
  canAddExpenses: boolean;
  canUploadDocuments: boolean;
  canDeleteExpenses: boolean;
  
  // Expense visibility
  showExpensesList: boolean;
}

export function getVisibleFields(userRole: UserRole, scheme: InvoiceScheme): VisibleFields {
  // Admin sees everything
  if (userRole === 'admin') {
    return {
      showBasicInfo: true,
      showClientBill: true,
      showCommissionDetails: true,
      showAgencyMargin: true,
      showClientBudget: true,
      showExpensesTotal: true,
      showClientRemaining: true,
      showPartnerShare: true,
      showAdminShare: true,
      showNetProfitAdmin: true,
      showAdminCatSplit: true,
      showAssistantBonus: true,
      canEditStatus: true,
      canEditPaymentDates: true,
      canEditNotes: true,
      canEditInvoiceNumber: true,
      canAddExpenses: true,
      canUploadDocuments: true,
      canDeleteExpenses: true,
      showExpensesList: true,
    };
  }

  // Assistant permissions - видит маржу 30%, НО НЕ видит распределение между партнёром и админом
  if (userRole === 'assistant') {
    return {
      showBasicInfo: true,
      showClientBill: true,
      showCommissionDetails: false, // НЕ видит процент партнера
      showAgencyMargin: isAgencyScheme(scheme), // Видит общую маржу агентства, но НЕ разбивку
      showClientBudget: isAgencyScheme(scheme), // Видит базу клиента только для agency схем
      showExpensesTotal: true, // Видит расходы для обеих схем
      showClientRemaining: isAgencyScheme(scheme), // Видит остаток клиента только для agency схем
      showPartnerShare: false, // НЕ видит распределение партнер/админ (15%/15%)
      showAdminShare: false, // НЕ видит долю админа
      showNetProfitAdmin: false,
      showAdminCatSplit: false,
      showAssistantBonus: true,
      canEditStatus: true,
      canEditPaymentDates: true, // Может редактировать даты оплаты
      canEditNotes: true, // Может редактировать примечания
      canEditInvoiceNumber: true, // Может редактировать номер счета
      canAddExpenses: true, // Может добавлять расходы для ОБЕИХ схем
      canUploadDocuments: true,
      canDeleteExpenses: true, // Может удалять расходы для обеих схем
      showExpensesList: true, // Видит список расходов для обеих схем
    };
  }

  // Client permissions - different based on scheme
  if (userRole === 'client') {
    if (isAgencyScheme(scheme)) {
      // For agency schemes, show budget and expenses
      return {
        showBasicInfo: true,
        showClientBill: true,
        showCommissionDetails: false,
        showAgencyMargin: true, // Show 30% margin
        showClientBudget: true, // Show 70% budget
        showExpensesTotal: true,
        showClientRemaining: true,
        showPartnerShare: false,
        showAdminShare: false,
        showNetProfitAdmin: false,
        showAdminCatSplit: false,
        showAssistantBonus: false,
        canEditStatus: false,
        canEditPaymentDates: false,
        canEditNotes: false,
        canEditInvoiceNumber: false,
        canAddExpenses: false,
        canUploadDocuments: false,
        canDeleteExpenses: false,
        showExpensesList: true, // Show all expenses
      };
    } else {
      // commission_based / partner_10 / partner_15:
      //   суммы комиссии, расходов и остатка по этим счетам клиенту не показываем.
      //   Но СПИСОК СПИСАНИЙ с описаниями отдаём (без сумм — обрезается на бэке
      //   и в колонке Сумма таблицы), чтобы клиент видел, что именно делалось.
      return {
        showBasicInfo: true,
        showClientBill: true,
        showCommissionDetails: false,
        showAgencyMargin: false,
        showClientBudget: false,
        showExpensesTotal: false,
        showClientRemaining: false,
        showPartnerShare: false,
        showAdminShare: false,
        showNetProfitAdmin: false,
        showAdminCatSplit: false,
        showAssistantBonus: false,
        canEditStatus: false,
        canEditPaymentDates: false,
        canEditNotes: false,
        canEditInvoiceNumber: false,
        canAddExpenses: false,
        canUploadDocuments: false,
        canDeleteExpenses: false,
        showExpensesList: true, // только описания и даты, без сумм
      };
    }
  }

  // Accountant permissions - same as assistant but for hidden invoices
  if (userRole === 'accountant') {
    return {
      showBasicInfo: true,
      showClientBill: true,
      showCommissionDetails: false,
      showAgencyMargin: isAgencyScheme(scheme),
      showClientBudget: isAgencyScheme(scheme),
      showExpensesTotal: true,
      showClientRemaining: isAgencyScheme(scheme),
      showPartnerShare: false,
      showAdminShare: false,
      showNetProfitAdmin: false,
      showAdminCatSplit: false,
      showAssistantBonus: false,
      canEditStatus: true,
      canEditPaymentDates: true,
      canEditNotes: true,
      canEditInvoiceNumber: true,
      canAddExpenses: true,
      canUploadDocuments: true,
      canDeleteExpenses: true,
      showExpensesList: true,
    };
  }

  // Partner permissions - видит свои комиссии и обязательства, НЕ видит внутреннюю кухню админа
  if (userRole === 'partner') {
    return {
      showBasicInfo: true,
      showClientBill: true,
      showCommissionDetails: true, // Видит свой процент
      showAgencyMargin: true, // Видит общую маржу
      showClientBudget: true,
      showExpensesTotal: true,
      showClientRemaining: true,
      showPartnerShare: true, // Видит свою долю
      showAdminShare: false, // НЕ видит долю админа
      showNetProfitAdmin: false, // НЕ видит чистую прибыль админа
      showAdminCatSplit: false, // НЕ видит разделение админ/кот
      showAssistantBonus: false, // НЕ видит бонусы ассистента
      canEditStatus: false,
      canEditPaymentDates: false,
      canEditNotes: false,
      canEditInvoiceNumber: false,
      canAddExpenses: false,
      canUploadDocuments: true,
      canDeleteExpenses: false,
      showExpensesList: true,
    };
  }

  // Default fallback (shouldn't happen)
  return {
    showBasicInfo: true,
    showClientBill: true,
    showCommissionDetails: false,
    showAgencyMargin: false,
    showClientBudget: false,
    showExpensesTotal: false,
    showClientRemaining: false,
    showPartnerShare: false,
    showAdminShare: false,
    showNetProfitAdmin: false,
    showAdminCatSplit: false,
    showAssistantBonus: false,
    canEditStatus: false,
    canEditPaymentDates: false,
    canEditNotes: false,
    canEditInvoiceNumber: false,
    canAddExpenses: false,
    canUploadDocuments: false,
    canDeleteExpenses: false,
    showExpensesList: false,
  };
}

export function getDocumentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    client_act: 'Акт от Заказчика',
    executor_receipt: 'Акт/Чек от Исполнителя',
    act: 'Акт выполненных работ',
    invoice: 'Счет',
    contract: 'Договор',
    other: 'Другое',
  };
  return labels[type] || type;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
