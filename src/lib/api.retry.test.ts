import { z } from 'zod';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from './api';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['POST', '/api/partner-payments'], ['PUT', '/api/partner-payments/payment'], ['DELETE', '/api/partner-payments/payment'],
])('retries the protected %s payment command with the same body and key', async (method, url) => {
  vi.stubGlobal('localStorage', { getItem: () => `payment-${method}` });
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('lost response')).mockResolvedValueOnce(new Response('{"ok":true}'));
  vi.stubGlobal('fetch', fetcher);
  await apiRequest(url, { method, body: method === 'DELETE' ? undefined : '{"amount":"100"}' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][1].headers.get('Idempotency-Key')).toBe(fetcher.mock.calls[1][1].headers.get('Idempotency-Key'));
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
});

it('reuses the command key and caller Headers after an uncertain network result', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'session-a' });
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('connection lost')).mockResolvedValueOnce(new Response('{"id":"same-invoice"}'));
  vi.stubGlobal('fetch', fetcher);
  const result = await apiRequest('/api/invoices', { method: 'POST', body: '{}', headers: new Headers({ 'Idempotency-Key': 'caller-key' }) }, z.object({ id: z.string() }));
  expect(result).toEqual({ id: 'same-invoice' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const call of fetcher.mock.calls) expect(call[1].headers.get('Idempotency-Key')).toBe('caller-key');
});

it('does not repeat an unprotected mutation or cross a session change', async () => {
  let session = 'old';
  vi.stubGlobal('localStorage', { getItem: () => session });
  const fetcher = vi.fn().mockImplementation(async () => { session = 'new'; throw new TypeError('lost'); });
  vi.stubGlobal('fetch', fetcher);
  await expect(apiRequest('/api/invoices', { method: 'POST', body: '{}' })).rejects.toThrow('lost');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockClear();
  await expect(apiRequest('/api/clients', { method: 'POST', body: '{}' })).rejects.toThrow('lost');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('keeps an uncertain command key for manual retry until a result is confirmed', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'manual-retry-session' });
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('lost')).mockRejectedValueOnce(new TypeError('lost'))
    .mockResolvedValueOnce(new Response('{"ok":true}')).mockResolvedValueOnce(new Response('{"ok":true}'));
  vi.stubGlobal('fetch', fetcher);
  const options = { method: 'POST', body: '{"invoiceNumber":"retry"}' };
  await expect(apiRequest('/api/invoices', options, z.object({ ok: z.literal(true) }))).rejects.toThrow('lost');
  await apiRequest('/api/invoices', options, z.object({ ok: z.literal(true) }));
  const keys = fetcher.mock.calls.map(call => call[1].headers.get('Idempotency-Key'));
  expect(new Set(keys).size).toBe(1);
  await apiRequest('/api/invoices', options, z.object({ ok: z.literal(true) }));
  expect(fetcher.mock.calls[3][1].headers.get('Idempotency-Key')).not.toBe(keys[0]);
});

it('retries an explicit period command with the same period and idempotency key', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'period-session' });
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('lost')).mockResolvedValueOnce(new Response('{"periodsUsed":1,"period":1,"closed":true}'));
  vi.stubGlobal('fetch', fetcher);
  await apiRequest('/api/invoices/fixture/periods', { method: 'POST', body: '{"period":1,"closed":true}' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][1].headers.get('Idempotency-Key')).toBe(fetcher.mock.calls[1][1].headers.get('Idempotency-Key'));
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
});

it('rejects an obsolete invoice response and retains its command key until a valid response arrives', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'schema-session' });
  const invoice = { id: '00000000-0000-4000-8000-000000000001', invoiceNumber: 'VALID', scheme: 'partner_10', status: 'draft', createdAt: '2026-01-01' };
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"id":"obsolete"}')).mockResolvedValueOnce(new Response(JSON.stringify(invoice)));
  vi.stubGlobal('fetch', fetcher);
  const options = { method: 'POST', body: '{"invoiceNumber":"VALID"}' };
  await expect(apiRequest('/api/invoices', options)).rejects.toThrow();
  await expect(apiRequest('/api/invoices', options)).resolves.toMatchObject({ invoiceNumber: 'VALID' });
  expect(fetcher.mock.calls[0][1].headers.get('Idempotency-Key')).toBe(fetcher.mock.calls[1][1].headers.get('Idempotency-Key'));
});
