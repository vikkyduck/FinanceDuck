const isLoopback = (host: string) => host === 'localhost' || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host);

/** In production only nginx on this host may reach the app; a public socket lets clients forge X-Forwarded-For. */
export function listenHost(env: Record<string, string | undefined> = process.env): string {
  if (env.NODE_ENV !== 'production') return env.HOST ?? '0.0.0.0';
  const host = env.HOST ?? '127.0.0.1';
  if (!isLoopback(host)) throw new Error(`HOST=${host || '(пусто)'}: в production FinanceDuck слушает только loopback за nginx`);
  return host;
}
