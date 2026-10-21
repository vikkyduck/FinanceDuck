import { expect, it } from 'vitest';
import { listenHost } from './listenConfig';
import { createApp } from './app';

// В проде до приложения доходят только через nginx на 127.0.0.1; публичный сокет
// позволил бы подделать X-Forwarded-For и обойти IP-лимит входа (N6, F2).
it('listens on loopback in production unless HOST is set, and refuses a public HOST', () => {
  expect(listenHost({ NODE_ENV: 'production' })).toBe('127.0.0.1');
  for (const host of ['127.0.0.1', '::1', 'localhost']) expect(listenHost({ NODE_ENV: 'production', HOST: host })).toBe(host);
  for (const host of ['0.0.0.0', '::', '5.129.198.180', '']) expect(() => listenHost({ NODE_ENV: 'production', HOST: host })).toThrow(/HOST/);
  expect(listenHost({ NODE_ENV: 'development', HOST: '0.0.0.0' })).toBe('0.0.0.0');
});

it('trusts X-Forwarded-For only from a loopback proxy', () => {
  const trust = createApp().get('trust proxy fn') as (address: string, hop: number) => boolean;
  expect(trust('127.0.0.1', 0)).toBe(true);
  expect(trust('::1', 0)).toBe(true);
  expect(trust('203.0.113.5', 0)).toBe(false);
});
