import { it, expect, vi } from 'vitest';
import express from 'express';
import { once } from 'node:events';
import ExcelJS from 'exceljs';
import { createExportRouter } from './routes/export';
import { createActsRouter } from './routes/acts';
import type { AuthMiddleware } from './middleware';
import type { ExportStore, ActsStore } from './routeStores';

async function withServer(router: express.Router, run: (url: string) => Promise<void>) {
  const app = express(); app.use(express.json(), router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  try { await run(`http://127.0.0.1:${address.port}`); } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
const authenticate: AuthMiddleware = async (req, _res, next) => { req.user = { role: 'admin', token: { id: 'actor', role: 'admin' } as never }; next(); };
it('streams a multi-batch XLSX with all invoices and matching expenses without the legacy all-rows API', async () => {
  const batches = [Array.from({ length: 200 }, (_, i) => ({ id: `i-${i}`, clientId: 'client', invoiceNumber: `INV-${i}`, status: 'paid', scheme: 'agency_30', clientBill: '1000', client: { id: 'client', name: 'Client' } })), [{ id: 'i-200', clientId: 'client', invoiceNumber: 'INV-200', status: 'paid', scheme: 'agency_30', clientBill: '2000', client: { id: 'client', name: 'Client' } }]];
  const getInvoices = vi.fn(() => { throw new Error('Unbounded read'); });
  const storage = { getInvoices,
    async *invoiceExportPages() { yield* batches; },
    async *expenseExportPages(ids: string[]) { yield [{ invoiceId: ids[0], description: 'cost', amount: '10', date: '2026-10-17', paidByAdmin: true }]; },
  } as unknown as ExportStore;
  await withServer(createExportRouter(storage, authenticate), async url => {
    const response = await fetch(`${url}/api/admin/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exportTypes: ['invoices', 'expenses'] }) });
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toContain('spreadsheetml');
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
    expect(workbook.getWorksheet('Счета')!.rowCount).toBe(202);
    expect(workbook.getWorksheet('Счета')!.getCell('A202').value).toBe('INV-200');
    expect(workbook.getWorksheet('Расходы')!.rowCount).toBe(3);
    expect(getInvoices).not.toHaveBeenCalled();
  });
});
it('authorizes the parent before reading or streaming any document bytes', async () => {
  const read = vi.fn(), open = vi.fn();
  const storage = { getSignedAct: vi.fn(async () => ({ id: 'a', invoiceId: 'foreign', actType: 'company' })), getInvoiceForRole: vi.fn(async () => null), readSignedActData: read, openSignedActFile: open } as unknown as ActsStore;
  await withServer(createActsRouter(storage, authenticate), async url => {
    for (const endpoint of ['download', 'content']) expect((await fetch(`${url}/api/acts/a/${endpoint}`)).status).toBe(404);
    expect(read).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  });
});

it('rejects malformed export filters before starting an XLSX stream', async () => {
  await withServer(createExportRouter({} as ExportStore, authenticate), async url => {
    for (const body of [{ exportTypes: [] }, { dateFrom: '2026-02-30' }, { statuses: 'paid' }]) {
      const response = await fetch(`${url}/api/admin/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      expect(response.status).toBe(400); expect(response.headers.get('content-type')).toContain('application/json');
    }
  });
});
