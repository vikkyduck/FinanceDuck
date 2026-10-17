/** Isolated PostgreSQL benchmark. Never uses DATABASE_URL; deletes only its generated fixture database. */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir, cpus, totalmem, platform, arch } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { getTableName } from 'drizzle-orm';
import * as schema from '../shared/schema';

const url = new URL(process.env.TEST_POSTGRES_URL ?? 'postgres://postgres@127.0.0.1:55439/postgres');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Local isolated test PostgreSQL required');
const name = `finance_bench_${randomUUID().replaceAll('-', '')}`;
const control = new Pool({ connectionString: url.toString(), max: 1 });
const directory = await mkdtemp(path.join(tmpdir(), 'finance-benchmark-'));
let pool: Pool | undefined, server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
const results: Record<string, unknown> = { date: new Date().toISOString(), node: process.version, platform: platform(), architecture: arch(), cpu: cpus()[0].model, cores: cpus().length, memoryMiB: totalmem() / 1048576, acceptance: 'HTTP p95 <= 750 ms, p99 <= 1500 ms, zero errors, at least 100 requests and 10 seconds per concurrency level; fixture-only, not production capacity' };
try {
  await control.query(`CREATE DATABASE "${name}"`);
  url.pathname = '/' + name; process.env.DATABASE_URL = url.toString(); process.env.ACCESS_CODE_SECRET = 'isolated-benchmark-secret-not-production';
  pool = new Pool({ connectionString: url.toString(), max: 10, options: '-c statement_timeout=60000' });
  results.postgres = (await pool.query('SELECT version()')).rows[0].version;
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  const { BackupService, backupTables } = await import('../server/backupService');
  const { FileObjectStore } = await import('../server/services/objectStore');
  const { InvoiceCommands } = await import('../server/services/invoiceCommands');
  const { DatabaseStorage } = await import('../server/storage');
  const { createInvoicesRouter } = await import('../server/routes/invoices');
  const { getAdminMonthlyData } = await import('../server/repositories/dashboardRepo');
  const { invoiceExportPages } = await import('../server/repositories/exportRepo');
  const objects = new FileObjectStore(path.join(directory, 'objects'));
  const backup = new BackupService(db, path.join(directory, 'backups'), objects);
  await db.insert(schema.loginRateLimits).values({ code: 'BENCH-LIMITER', attemptCount: 1, lastAttempt: Date.now() });
  const actorId = randomUUID();
  await db.insert(schema.accessTokens).values({ id: actorId, code: 'BENCHMARK-FIXTURE', role: 'admin' });
  await pool.query(`CREATE FUNCTION fixture_uuid(text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT overlay(overlay(md5($1) placing '4' from 13 for 1) placing 'a' from 17 for 1)::uuid $$`);
  await pool.query(`INSERT INTO partners(id, name) SELECT fixture_uuid('partner-'||n), 'Fixture partner '||n FROM generate_series(1,20) n`);
  await pool.query(`INSERT INTO clients(id, name) SELECT fixture_uuid('client-'||n), 'Fixture client '||n FROM generate_series(1,200) n`);
  const app = express(); app.use(express.json());
  app.use(createInvoicesRouter(new DatabaseStorage(db), (req, _res, next) => { req.user = { role: 'admin', token: { id: actorId } } as typeof req.user; next(); }, db, new InvoiceCommands(db)));
  app.get('/bench/monthly', async (_req, res) => { res.json(await getAdminMonthlyData(db, 2026)); });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No benchmark listener');
  const origin = `http://127.0.0.1:${address.port}`;
  const runs: unknown[] = []; results.http = runs;
  const scales = (process.env.BENCH_COUNTS ?? '10000,100000').split(',').map(Number);
  let previous = 0;
  for (const count of scales) {
    if (!Number.isSafeInteger(count) || count < previous || count > 1000000) throw new Error('Invalid benchmark count');
    await pool.query(`INSERT INTO invoices(id,invoice_number,client_id,partner_id,scheme,status,client_bill,created_by,created_at,actual_payment_date)
      SELECT fixture_uuid('invoice-'||n),'BENCH-'||n,fixture_uuid('client-'||(1+n%200)),fixture_uuid('partner-'||(1+n%20)),'agency_30','paid',1000,$3,
      '2026-01-01'::timestamptz + (n%300)*interval '1 day','2026-01-01'::date+(n%300) FROM generate_series($1::int,$2::int) n`, [previous+1,count,actorId]);
    await pool.query(`INSERT INTO invoice_calculations(invoice_id,client_bill,executor_expenses_total,net_profit_admin,client_remaining)
      SELECT fixture_uuid('invoice-'||n),1000,30,150,670 FROM generate_series($1::int,$2::int) n`, [previous+1,count]);
    await pool.query(`INSERT INTO invoice_expenses(invoice_id,description,amount,created_by,date)
      SELECT fixture_uuid('invoice-'||n),'Fixture expense '||k,10,$3,'2026-01-01' FROM generate_series($1::int,$2::int) n CROSS JOIN generate_series(1,3) k`, [previous+1,count,actorId]);
    previous = count; await pool.query('ANALYZE');
    for (const concurrency of (process.env.BENCH_BACKUP_ONLY === '1' ? [] : [1,5,20,40])) {
      const times: number[] = []; let errors = 0, next = 0;
      // Warm the query plans and buffers outside the measurement.
      for (let i=0;i<5;i++) await fetch(origin+'/api/invoices?page=1&limit=100').then(r=>r.arrayBuffer());
      const start = performance.now();
      await Promise.all(Array.from({ length: concurrency }, async () => {
        for (;;) {
          const i = next++; if (i >= 100 && performance.now() - start >= 10000) return;
          const route = i % 10 === 0 ? '/bench/monthly' : i % 5 === 0 ? '/api/invoices?page=1&limit=100&search=BENCH-99' : `/api/invoices?page=${1+i%10}&limit=100`;
          const t = performance.now();
          try { const response = await fetch(origin+route, { signal: AbortSignal.timeout(60000) }); if (!response.ok) errors++; await response.arrayBuffer(); } catch { errors++; }
          times.push(performance.now()-t);
        }
      }));
      times.sort((a,b)=>a-b);
      const row = { invoices: count, expenses: count*3, concurrency, requests: times.length, errors,
        p50: Math.round(times[Math.ceil(times.length*.5)-1]), p95: Math.round(times[Math.ceil(times.length*.95)-1]), p99: Math.round(times[Math.ceil(times.length*.99)-1]),
        requestsPerSecond: +(times.length/((performance.now()-start)/1000)).toFixed(1), rssMiB: Math.round(process.memoryUsage().rss/1048576) };
      runs.push(row); console.log(JSON.stringify(row));
    }
  }
  console.log('HTTP benchmark complete; preparing document fixtures');
  const docs = Number(process.env.BENCH_DOCUMENTS ?? 100);
  const invoiceId = (await pool.query(`SELECT id FROM invoices LIMIT 1`)).rows[0].id;
  for(let n=0;n<docs;n++) {
    const objectKey = await objects.put(randomBytes(1024*1024));
    await db.insert(schema.signedActs).values({ invoiceId, objectKey, fileName: `fixture-${n}.bin`, actType: 'company', uploadedBy: actorId });
  }
  const fingerprints = async () => {
    const out: Record<string, unknown> = {};
    for (const table of Object.values(backupTables)) {
      const tableName = getTableName(table);
      out[tableName] = (await pool!.query(`SELECT count(*)::int AS count, sum(('x'||substr(md5(to_jsonb(t)::text),1,16))::bit(64)::bigint::numeric)::text AS digest FROM "${tableName}" t`)).rows[0];
    }
    return out;
  };
  const before = await fingerprints();
  let peakRss = process.memoryUsage().rss, peakHeap = process.memoryUsage().heapUsed;
  const sampler = setInterval(() => { const m=process.memoryUsage();peakRss=Math.max(peakRss,m.rss);peakHeap=Math.max(peakHeap,m.heapUsed); },20);
  try {
    console.log('Starting streaming archive round trip');
    const start = performance.now(); const info = await backup.createBackup(); const createMs = Math.round(performance.now()-start);
    // Simulate complete object-volume loss while SQL document references survive.
    await rm(path.join(directory, 'objects'), { recursive: true });
    console.log(`Archive created in ${createMs} ms; starting authenticated restore`);
    const restoreStart = performance.now(); const restored = await backup.restoreBackup(info.id);
    if (!restored.success) throw new Error(restored.message);
    if (JSON.stringify(before)!==JSON.stringify(await fingerprints())) throw new Error('Restored data fingerprints differ');
    let verifiedObjects = 0;
    for(const row of (await pool.query('SELECT object_key FROM signed_acts')).rows) { await objects.get(row.object_key); verifiedObjects++; }
    results.backup = { invoices: previous, expenses: previous*3, documentMiB: docs, archiveBytes: (await stat(path.join(directory,'backups',info.id))).size,
      createMs, restoreMs: Math.round(performance.now()-restoreStart), peakRssMiB:Math.round(peakRss/1048576), peakHeapMiB:Math.round(peakHeap/1048576), verifiedObjects, recoveredEmptyObjectVolume: true, allTableFingerprintsMatch: true };
    console.log(JSON.stringify(results.backup));
  } finally { clearInterval(sampler); }
  let exported = 0; const exportStart = performance.now();
  for await (const page of invoiceExportPages(db, { role: 'admin' }, {})) exported += page.length;
  results.export = { invoices: exported, durationMs: Math.round(performance.now()-exportStart) };
  results.databaseBytes = (await pool.query('SELECT pg_database_size(current_database())::text AS bytes')).rows[0].bytes;
  await writeFile(process.env.BENCH_OUTPUT ?? '/tmp/finance-benchmark.json', JSON.stringify(results,null,2));
} finally {
  await new Promise<void>(resolve => server ? server.close(()=>resolve()) : resolve());
  await pool?.end();
  await control.query(`DROP DATABASE IF EXISTS "${name}"`); await control.end();
  await rm(directory,{recursive:true,force:true});
}
