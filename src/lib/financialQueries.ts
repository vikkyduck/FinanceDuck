import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** Shared identities for invoice views and financial read models. */
export const financialKeys = {
  invoices: () => ['/api/invoices'] as const,
  invoice: (id: string | null | undefined) => ['/api/invoices', 'detail', id] as const,
  adminStats: (year: number, month: number) => ['/api/admin/dashboard-stats', year, month] as const,
  agencyFunds: () => ['/api/do-not-spend'] as const,
  partnerFunds: () => ['/api/do-not-spend/partner-schemes'] as const,
};
const prefixes = ['/api/invoices', '/api/admin/', '/api/client/', '/api/partner', '/api/clients',
  '/api/do-not-spend', '/api/expected-', '/api/dashboard/', '/api/assistant', '/api/accountant',
  '/api/alert-counts', '/api/priority-actions', '/api/overdue', '/api/document-status', '/api/working-capital', '/api/financial-'];
const legacyKeys = new Set(['dashboard-stats', 'invoices', 'admin-stats', 'admin-monthly-data',
  'invoices-by-month', 'invoices-overdue', 'partner-debt', 'client-ltv', 'admin-forecast', 'admin-drafts-stats', 'assistant-monthly-chart']);
export const isFinancialQuery = (key: QueryKey) => {
  const first = key[0];
  return typeof first === 'string' && (legacyKeys.has(first) || prefixes.some(prefix => first.startsWith(prefix)));
};

/** A committed financial mutation invalidates every dependent read model in this session. */
export const invalidateFinancialQueries = (client: QueryClient) =>
  client.invalidateQueries({ predicate: query => isFinancialQuery(query.queryKey) });
