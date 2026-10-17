import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { stripSensitiveFieldsForRole } from '../../../server/permissions';

const auth = vi.hoisted(() => ({ role: 'admin', partnerId: '00000000-0000-4000-8000-000000000002', clientId: '00000000-0000-4000-8000-000000000003', logout: vi.fn(), csrfToken: 'test' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useDownloadReport', () => ({ useDownloadReport: () => ({ download: vi.fn(), isDownloadingKey: () => false }) }));
vi.mock('@/hooks/useReportPreview', () => ({ useReportPreview: () => ({ previewOpen: false, fetchPreview: vi.fn() }) }));
vi.mock('@/components/shared/ReportPreviewDialog', () => ({ ReportPreviewDialog: () => null }));
vi.mock('@/components/invoices/SignedActsSection', () => ({ SignedActsSection: () => null }));
vi.mock('@/components/layout/DashboardLayout', () => ({ DashboardLayout: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/layout/DashboardHeader', () => ({ DashboardHeader: () => null }));
vi.mock('./assistant/CreateInvoiceDialog', () => ({ CreateInvoiceDialog: () => null }));
vi.mock('./assistant/InvoicesList', () => ({ InvoicesList: () => null }));
vi.mock('@/hooks/useExportMyInvoices', () => ({ useExportMyInvoices: () => ({ handleExport: vi.fn(), isExporting: false }) }));
vi.mock('@/hooks/useViewMode', () => ({ useViewMode: () => ({ viewMode: 'table', setViewMode: vi.fn() }) }));
vi.mock('@/components/ui/tabs', () => {
  const Active = React.createContext({ value: '', change: (_value: string) => {} });
  return {
    Tabs: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => <Active.Provider value={{ value, change: onValueChange }}>{children}</Active.Provider>,
    TabsList: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    TabsContent: ({ value, children }: { value: string; children: React.ReactNode }) => React.useContext(Active).value === value ? <div>{children}</div> : null,
    TabsTrigger: ({ value, children, ...props }: { value: string; children: React.ReactNode }) => {
      const context = React.useContext(Active); return <button {...props} onClick={() => context.change(value)}>{children}</button>;
    },
  };
});
import InvoicePage from '@/pages/InvoicePage';
import { AccountantDashboard } from './AccountantDashboard';

const id = '00000000-0000-4000-8000-000000000001';
const invoice = { id, invoiceNumber: 'PAGE-100', scheme: 'partner_10' as const, status: 'paid' as const, createdAt: '2026-01-01T00:00:00.000Z',
  clientId: auth.clientId, partnerId: auth.partnerId, client: { id: auth.clientId, name: 'Клиент' }, partner: { id: auth.partnerId, name: 'Партнер' },
  calculations: { clientBill: '100.00', commissionAmount: '10.00', executorExpensesTotal: '20.00', netProfitAdmin: '90.00' } };
const expenses = [{ id, invoiceId: id, description: 'Работа исполнителя', date: '2026-01-01', amount: '20.00', paidByAdmin: false }];
let tree: ReactTestRenderer, queryClient: QueryClient, fetcher: ReturnType<typeof vi.fn>;
let fail: string;
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
beforeEach(() => {
  auth.role = 'admin'; fail = '';
  vi.stubGlobal('localStorage', { getItem: () => 'test' });
  vi.stubGlobal('window', new EventTarget());
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  fetcher = vi.fn(async (url: string) => {
    if (fail && url.includes(fail)) return new Response('{"error":"Unavailable"}', { status: 503 });
    const projected = stripSensitiveFieldsForRole(invoice, auth.role as 'admin');
    const body = url.includes('accountant-logs') ? { total: 1, logs: [{ id, actionType: 'create_invoice', description: 'Проверка журнала', createdAt: invoice.createdAt }] }
      : url.includes('/expenses') ? auth.role === 'client' ? expenses.map(({ amount: _a, paidByAdmin: _p, ...row }) => row) : expenses
      : url.includes('/invoices?') ? { invoices: [projected], total: 1, page: 1, pages: 1, clients: [], partners: [], statusCounts: { all: 1, draft: 0, sent: 0, paid: 1, cancelled: 0, overdue: 0 } }
      : projected;
    return new Response(JSON.stringify(body));
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { act(() => tree?.unmount()); queryClient.clear(); vi.unstubAllGlobals(); });
async function render(element: React.ReactNode) {
  await act(async () => { tree = create(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[`/invoices/${id}`]}><Routes><Route path="/invoices/:id" element={element} /></Routes></MemoryRouter></QueryClientProvider>); });
  await settle();
}
const text = () => JSON.stringify(tree.toJSON());
it.each(['admin', 'partner', 'assistant', 'accountant', 'client'])('renders the full invoice page using the actual %s projection', async role => {
  auth.role = role; await render(<InvoicePage />);
  expect(text()).toContain('PAGE-100'); expect(text()).toContain('Работа исполнителя'); expect(text()).not.toContain('NaN');
  if (role === 'admin') {
    expect(text()).toContain('Вознаграждение партнера');
    const amounts = tree.root.findAllByType('span').map(node => node.children.join(''));
    expect(amounts.some(value => /10[\s\u00a0]*₽/.test(value))).toBe(true);
    expect(amounts.some(value => /20[\s\u00a0]*₽/.test(value))).toBe(true);
  }
  expect(text().includes('(Партнер)')).toBe(role !== 'client');
  expect(text()).not.toContain('(Админ)');
  if (role === 'client') expect(text()).not.toContain('Чистая прибыль');
});
it('shows expense failures instead of a misleading empty list', async () => {
  fail = '/expenses'; await render(<InvoicePage />);
  expect(text()).toContain('Не удалось загрузить счёт и расходы'); expect(text()).toContain('Повторить');
});
it('loads accountant documents/history at canonical URLs and displays transport failures', async () => {
  auth.role = 'accountant'; await render(<AccountantDashboard />);
  await act(async () => tree.root.findAllByProps({ 'data-testid': 'tab-accountant-documents' }).find(node => node.type === 'button')!.props.onClick()); await settle();
  expect(text()).toContain('PAGE-100'); expect(fetcher.mock.calls.some(([url]) => url.startsWith('/api/invoices?'))).toBe(true);
  await act(async () => tree.root.findAllByProps({ 'data-testid': 'tab-accountant-logs' }).find(node => node.type === 'button')!.props.onClick()); await settle();
  expect(text()).toContain('Проверка журнала'); expect(fetcher.mock.calls.some(([url]) => url === '/api/accountant-logs?limit=50')).toBe(true);
  expect(fetcher.mock.calls.some(([url]) => url.includes('/api/api/'))).toBe(false);
  fail = 'accountant-logs'; await act(async () => { await queryClient.invalidateQueries({ queryKey: ['/api/accountant-logs'] }); }); await settle();
  expect(text()).toContain('Не удалось загрузить журнал');
  fail = '/invoices?'; await act(async () => tree.root.findAllByProps({ 'data-testid': 'tab-accountant-documents' }).find(node => node.type === 'button')!.props.onClick());
  await act(async () => { await queryClient.invalidateQueries({ queryKey: ['/api/invoices'] }); }); await settle();
  expect(text()).toContain('Не удалось загрузить документы');
});
