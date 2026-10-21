import React, { Profiler } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/ui/dialog', () => {
  const Pass = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  return { Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) => open ? <div>{children}</div> : null,
    DialogContent: Pass, DialogHeader: Pass, DialogTitle: Pass, DialogDescription: Pass, DialogFooter: Pass };
});
vi.mock('@/components/ui/alert-dialog', () => {
  const Pass = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  return { AlertDialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) => open ? <div>{children}</div> : null,
    AlertDialogContent: Pass, AlertDialogHeader: Pass, AlertDialogTitle: Pass, AlertDialogDescription: Pass,
    AlertDialogFooter: Pass, AlertDialogCancel: Pass, AlertDialogAction: Pass };
});
vi.mock('./SignedActsSection', () => ({ SignedActsSection: () => null }));
vi.mock('@/components/messages/SendMessageDialog', () => ({ SendMessageDialog: () => null }));
vi.mock('./assistant/AddExpenseDialog', () => ({ AddExpenseDialog: () => null }));
vi.mock('./assistant/EditExpenseDialog', () => ({ EditExpenseDialog: () => null }));
vi.mock('@/components/invoices/InvoiceWaterfallChart', () => ({ InvoiceWaterfallChart: () => null }));
import { InvoiceDetailsDialog } from './InvoiceDetailsDialog';

const id = '00000000-0000-4000-8000-000000000001';
const invoice = { id, invoiceNumber: 'N7-1', scheme: 'commission_based', status: 'sent', createdAt: '2026-10-01T00:00:00.000Z',
  clientBill: '1000.00', plannedExpenses: '0', notes: 'old', paymentDate: '2026-11-01', partnerCommissionRate: '10.00',
  calculations: { clientBill: '1000.00', commissionRate: '10.00', commissionAmount: '100.00', netProfitAdmin: '900.00' } };
let tree: ReactTestRenderer, client: QueryClient, renders: number;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const byTestId = (testId: string) => tree.root.findAll(node => node.props['data-testid'] === testId && typeof node.type === 'string')[0];
const notesField = () => tree.root.findAll(node => node.type === 'textarea')[0];

beforeEach(() => {
  // Без act: при зацикливании эффектов act() крутит очередь синхронно и вешает процесс,
  // а планировщик React между проходами отдаёт управление таймерам, и тест успевает посчитать рендеры.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  vi.stubGlobal('localStorage', { getItem: () => 'test' });
  vi.stubGlobal('window', new EventTarget());
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/expenses') ? [] : invoice))));
  renders = 0;
});
afterEach(() => {
  tree?.unmount(); client.clear(); vi.unstubAllGlobals();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

it('keeps typed bill and notes on an invoice with a payment date without a render loop', async () => {
  tree = create(<QueryClientProvider client={client}><Profiler id="invoice" onRender={() => { renders++; }}>
    <InvoiceDetailsDialog open onOpenChange={() => {}} invoiceId={id} canEdit userRole="admin" />
  </Profiler></QueryClientProvider>);
  await wait(100);
  expect(byTestId('input-client-bill').props.value).toBe(1000);

  byTestId('input-client-bill').props.onChange({ target: { value: '1500' } });
  notesField().props.onChange({ target: { value: 'введено вручную' } });
  await wait(200);

  expect(byTestId('input-client-bill').props.value).toBe(1500);
  expect(notesField().props.value).toBe('введено вручную');
  expect(renders).toBeLessThanOrEqual(20);
});
