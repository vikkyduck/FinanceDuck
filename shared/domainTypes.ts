export const USER_ROLES = ['assistant', 'partner', 'admin', 'client', 'accountant'] as const;
export const INVOICE_SCHEMES = ['partner_10', 'partner_15', 'agency_30', 'agency_40', 'commission_based', 'agency'] as const;
export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'cancelled'] as const;
export type UserRole = typeof USER_ROLES[number];
export type InvoiceScheme = typeof INVOICE_SCHEMES[number];
export type InvoiceStatus = typeof INVOICE_STATUSES[number];
