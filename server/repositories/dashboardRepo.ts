/** Stable facade for domain-specific dashboard queries. No financial rules here. */
export { getAdminMonthlyData, getAdminDashboardStats, getDashboardInvoices } from './adminDashboardRepo';
export { getPartnerHeroMetrics } from './partnerDashboardRepo';
export { getPartnerDebtSummaries, getPartnerInvoicesDetail, getPartnerDebtDetails } from './partnerDebtRepo';
export { getClientBudget } from './clientBudgetRepo';
export { getClientOverviewBuckets } from './clientOverviewRepo';
