import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from './api';

afterEach(() => vi.unstubAllGlobals());

it('reuses the command key and caller Headers after an uncertain network result', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'session-a' });
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('connection lost')).mockResolvedValueOnce(new Response('{"id":"same-invoice"}'));
  vi.stubGlobal('fetch', fetcher);
  const result = await apiRequest('/api/invoices', { method: 'POST', body: '{}', headers: new Headers({ 'Idempotency-Key': 'caller-key' }) });
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
  await expect(apiRequest('/api/invoices', options)).rejects.toThrow('lost');
  await apiRequest('/api/invoices', options);
  const keys = fetcher.mock.calls.map(call => call[1].headers.get('Idempotency-Key'));
  expect(new Set(keys).size).toBe(1);
  await apiRequest('/api/invoices', options);
  expect(fetcher.mock.calls[3][1].headers.get('Idempotency-Key')).not.toBe(keys[0]);
});
