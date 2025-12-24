export type UserRole = 'assistant' | 'partner' | 'admin' | 'client';
export type InvoiceScheme = 'agency_30' | 'agency_40' | 'commission_based';

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
      showAgencyMargin: scheme === 'agency_30' || scheme === 'agency_40', // Видит общую маржу агентства, но НЕ разбивку
      showClientBudget: scheme === 'agency_30' || scheme === 'agency_40', // Видит базу клиента только для agency схем
      showExpensesTotal: true, // Видит расходы для обеих схем
      showClientRemaining: scheme === 'agency_30' || scheme === 'agency_40', // Видит остаток клиента только для agency схем
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
    if (scheme === 'agency_30' || scheme === 'agency_40') {
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
      // For commission-based schemes, show only bill and status
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
        showExpensesList: false, // Don't show expenses
      };
    }
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
