import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(async (path: string) => path.startsWith('/admin/forecast')
    ? [
      { monthIndex: 10, monthName: 'Ноябрь', yearNum: 2026, expectedAmount: 124500, receivedAmount: 0 },
      { monthIndex: 11, monthName: 'Декабрь', yearNum: 2026, expectedAmount: 0, receivedAmount: 0 },
    ]
    : [
      { monthNumber: 1, totalSales: 0, totalProfit: 0, invoiceCount: 0, expenses: 0 },
      { monthNumber: 2, totalSales: 180000, totalProfit: 112000, invoiceCount: 1, expenses: 50000 },
    ]),
}));
import { RevenueForecastTable } from './RevenueForecastTable';
import { MonthlyFinancialTable } from './MonthlyFinancialTable';

let tree: ReactTestRenderer | undefined;
let consoleError: MockInstance<typeof console.error>;
let errors: string[];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  errors = [];
  consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args.map(String).join(' ')); });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  consoleError.mockRestore();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

async function render(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => { tree = create(<QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  return tree!;
}

// Строка месяца и строка подробностей возвращаются из map одним фрагментом: ключ нужен на фрагменте.
it.each([
  ['RevenueForecastTable', <RevenueForecastTable />, 'row-forecast-10-2026'],
  ['MonthlyFinancialTable', <MonthlyFinancialTable year={2026} />, 'row-month-2'],
])('%s renders month rows without React key warnings', async (_name, element, rowTestId) => {
  const rendered = await render(element);
  expect(rendered.root.findAll(node => node.props['data-testid'] === rowTestId).length).toBeGreaterThan(0);
  expect(errors.filter(message => message.includes('unique "key"'))).toEqual([]);
});
