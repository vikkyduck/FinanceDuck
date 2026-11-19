/** Bounded read-only HTTP observation. Obtain an existing session outside this script; never logs credentials or response bodies. */
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const origin = new URL(process.env.PROBE_ORIGIN!);
if (origin.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(origin.hostname)) throw new Error('HTTPS required');
const cookie = process.env.PROBE_COOKIE;
if (!cookie) throw new Error('Existing authorized session required');
const seconds = Number(process.env.PROBE_SECONDS ?? 1200);
const concurrency = Number(process.env.PROBE_CONCURRENCY ?? 2);
const interval = Number(process.env.PROBE_INTERVAL_MS ?? 1000);
if (!Number.isFinite(seconds) || seconds < 10 || seconds > 3600 || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 5 || !Number.isFinite(interval) || interval < 250) throw new Error('Probe exceeds bounded duration/rate');
const routes = ['/api/invoices?limit=100', '/api/invoices/client-balances?limit=25', '/api/assistant/invoice-summary?year=2026',
  '/api/assistant/invoice-groups?year=2026&limit=25', '/api/clients/acts-status?limit=25', '/api/closing-docs-status?limit=25',
  '/api/do-not-spend', '/api/do-not-spend/partner-schemes', '/api/alert-counts'];
const start = performance.now(), startedAt = new Date().toISOString();
let next = 0, failures = 0;
const samples: { elapsedSeconds: number; route: string; ms: number; status: number }[] = [];
const memory: { elapsedSeconds: number; rssKiB: number }[] = [];
const percentile = (values: number[], p: number) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : 0;
const summarize = (rows: typeof samples) => ({
  requests: rows.length, errors: rows.filter(row => row.status !== 200).length,
  p50: percentile(rows.map(row => row.ms), .5), p95: percentile(rows.map(row => row.ms), .95), p99: percentile(rows.map(row => row.ms), .99)
});
const processId = process.env.PROBE_PROCESS_ID;
const sampler = setInterval(() => {
  console.log(JSON.stringify({ elapsedSeconds: Math.round((performance.now() - start) / 1000), ...summarize(samples) }));
  if (processId && /^\d+$/.test(processId)) void readFile(`/proc/${processId}/status`, 'utf8').then(status => {
    const rss = /^VmRSS:\s+(\d+) kB/m.exec(status);
    if (rss) memory.push({ elapsedSeconds: Math.round((performance.now() - start) / 1000), rssKiB: Number(rss[1]) });
  }).catch(() => { });
}, 30000);
try {
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (performance.now() - start < seconds * 1000 && failures < 3) {
      const route = routes[next++ % routes.length], at = performance.now();
      let status: number;
      try {
        const response = await fetch(new URL(route, origin), { headers: { Cookie: cookie }, redirect: 'error', signal: AbortSignal.timeout(5000) });
        status = response.status;
        await response.json();
      } catch { status = 0; }
      if (status !== 200) failures++;
      samples.push({ elapsedSeconds: Math.round((performance.now() - start) / 1000), route, ms: Math.round(performance.now() - at), status });
      await delay(Math.max(0, interval - (performance.now() - at)));
    }
  }));
} finally { clearInterval(sampler); }
const minutes = Object.fromEntries(Array.from({ length: Math.ceil(seconds / 60) }, (_, minute) => [minute + 1, summarize(samples.filter(row => row.elapsedSeconds >= minute * 60 && row.elapsedSeconds < (minute + 1) * 60))]));
const output = {
  startedAt, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - start) / 1000), concurrency, intervalMs: interval,
  ...summarize(samples), endpoints: Object.fromEntries(routes.map(route => [route, summarize(samples.filter(row => row.route === route))])), minutes, memory,
  scope: 'Observed authenticated read workload on the live service; not a destructive saturation test or an estimate of its maximum capacity.'
};
await writeFile(process.env.PROBE_OUTPUT ?? '/tmp/finance-read-probe.json', JSON.stringify(output, null, 2), { mode: 0o600 });
console.log(JSON.stringify(output));
if (failures) process.exitCode = 1;
