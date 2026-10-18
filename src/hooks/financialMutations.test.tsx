import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useInvoiceArchive } from './useInvoiceArchive';
import { useInvoiceCommands } from './useInvoiceCommands';
import { financialKeys } from '@/lib/financialQueries';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const id = '00000000-0000-4000-8000-000000000001';
const invoice = { id, invoiceNumber: 'CACHE-REGRESSION', scheme: 'agency_30', status: 'paid', clientBill: '1000',
  createdAt: '2026-10-18', serviceType: 'periodic', periodsUsed: 0, totalPeriods: 2, pricePerPeriod: '500', periodUnit: 'month' };
let tree: ReactTestRenderer, client: QueryClient, commands: ReturnType<typeof useInvoiceCommands>;
let archive: ReturnType<typeof useInvoiceArchive>;
let fetcher: ReturnType<typeof vi.fn>;
const keys = [financialKeys.invoices(), financialKeys.agencyFunds(), financialKeys.partnerFunds(), financialKeys.adminStats(2026, 9),
  ['/api/client/budget'], ['/api/partner-debt'], ['admin-monthly-data', 2026], ['/api/expected-commission']];
function Probe() { archive = useInvoiceArchive(id); commands = useInvoiceCommands({ open: false, invoiceId: id, userRole: 'admin', canEdit: true }); return null; }
beforeEach(async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'cache-session' });
  vi.stubGlobal('confirm', () => true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  for (const key of keys) client.setQueryData(key, { synthetic: true });
  client.setQueryData(['/api/backups'], []);
  client.setQueryData(financialKeys.invoice(id), { invoice, expenses: [] });
  fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/periods')
    ? { periodsUsed: 1, period: 1, closed: true } : url.includes('/expenses/') ? { success: true } : invoice)));
  vi.stubGlobal('fetch', fetcher);
  await act(async () => { tree = create(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); });
});
afterEach(() => { act(() => tree?.unmount()); client.clear(); vi.unstubAllGlobals(); });

it.each(['expense-delete', 'terms-update', 'period-close', 'period-reopen', 'period-convert', 'visibility-toggle', 'archive', 'unarchive'])(
  '%s invalidates the real financial dashboard keys after the successful mutation', async operation => {
    if (operation === 'archive' || operation === 'unarchive') {
      await act(async () => archive.setArchived(operation === 'archive'));
    } else if (operation === 'visibility-toggle') {
      await act(async () => commands.handleToggleHideFromAssistant(true));
    } else if (operation === 'expense-delete') {
      await act(async () => commands.setDeleteExpense({ id, description: 'Synthetic' }));
      await act(async () => commands.handleDeleteExpense());
    } else if (operation === 'terms-update') {
      await act(async () => commands.setClientBillEdit(1200));
      await act(async () => commands.handleUpdateClientBill(1200));
    } else if (operation === 'period-convert') {
      await act(async () => { commands.setConvertPrice('500'); commands.setConvertTotal('2'); });
      await act(async () => commands.handleConvertToSubscription());
    } else {
      if (operation === 'period-reopen') {
        await act(async () => { client.setQueryData(financialKeys.invoice(id), { invoice: { ...invoice, periodsUsed: 1 }, expenses: [] }); });
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      }
      await act(async () => commands.handleSetPeriod(operation === 'period-close'));
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated, String(key)).toBe(true);
    expect(client.getQueryState(['/api/backups'])?.isInvalidated).toBe(false);
  },
);
