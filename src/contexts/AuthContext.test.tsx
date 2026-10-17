import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AuthProvider } from "./AuthContext";
import { useAuthContext } from "@/contexts/auth-context";

let auth: ReturnType<typeof useAuthContext>;
let cache: QueryClient;
let tree: ReactTestRenderer;
let loginSequence: number;
function Probe() {
  auth = useAuthContext(); cache = useQueryClient();
  return <span>{auth.role}</span>;
}
beforeEach(() => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  vi.stubGlobal('localStorage', storage); vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('window', new EventTarget()); loginSequence = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/login')
    ? { success: true, csrfToken: `session-${++loginSequence}`, user: { role: loginSequence === 1 ? 'admin' : 'client', clientId: 'client' } }
    : url.endsWith('/validate') ? { valid: false } : { success: true } })));
});
afterEach(() => { act(() => tree?.unmount()); vi.unstubAllGlobals(); });

it('isolates caches and in-flight responses when admin logs out and a client logs in', async () => {
  await act(async () => { tree = create(<AuthProvider><Probe /></AuthProvider>); });
  await act(async () => { await auth.login('admin'); });
  const adminCache = cache;
  adminCache.setQueryData(['/api/invoices'], [{ secret: 'admin-data' }]);
  let finish: (value: string) => void;
  const late = adminCache.fetchQuery({ queryKey: ['late-admin'], queryFn: () => new Promise<string>(resolve => { finish = resolve; }) }).catch(() => undefined);
  await act(async () => { await auth.logout(); });
  await act(async () => { await auth.login('client'); });
  await act(async () => { finish!('private response'); await late; });
  expect(auth.role).toBe('client');
  expect(cache).not.toBe(adminCache);
  expect(cache.getQueryData(['/api/invoices'])).toBeUndefined();
  expect(cache.getQueryData(['late-admin'])).toBeUndefined();
});

it('does not let an older validation response overwrite a later successful login', async () => {
  let finishValidation: (value: unknown) => void;
  const oldFetch = fetch;
  vi.stubGlobal('fetch', vi.fn((url: string, options: RequestInit) => url.endsWith('/validate')
    ? Promise.resolve({ json: () => new Promise(resolve => { finishValidation = resolve; }) }) : oldFetch(url, options)));
  await act(async () => { tree = create(<AuthProvider><Probe /></AuthProvider>); });
  await act(async () => { await auth.login('admin'); });
  await act(async () => { finishValidation!({ valid: false }); });
  expect(auth.role).toBe('admin'); expect(auth.isAuthenticated).toBe(true);
});
