import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { Readable, PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { getTableColumns, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import type { db } from '../db';
import { backupTables, type TableKey } from './backupTables';
import { objectDigest, type ObjectStore } from './objectStore';

const MAX_LINE = 20 * 1024 * 1024;
const validators = Object.fromEntries(Object.entries(backupTables).map(([key, table]) => [key, createSelectSchema(table).strict()]));
const tableKeys = Object.keys(backupTables) as TableKey[];
type Meta = { createdAt: string; type: 'manual' | 'auto' };
/** Columns added after an archive schema: schema 5 / legacy JSON had no administrative
 *  archive marker, schemas up to 6 had no partner directToOwner flag, schemas up to 7
 *  had no expense paidAt (settled on the expense date, as migration 0009 does). */
export function upgradeLegacyRow(key: TableKey, row: Record<string, unknown>, schema: number) {
  let upgraded = row;
  if (schema < 6 && key === 'invoices' && !Object.hasOwn(upgraded, 'archivedAt')) upgraded = { ...upgraded, archivedAt: null };
  if (schema < 7 && key === 'partners' && !Object.hasOwn(upgraded, 'directToOwner')) upgraded = { ...upgraded, directToOwner: false };
  if (schema < 8 && key === 'invoiceExpenses' && !Object.hasOwn(upgraded, 'paidAt')) upgraded = { ...upgraded, paidAt: upgraded.date ?? null };
  return upgraded;
}
export type ArchiveItem = { kind: 'table'; table: TableKey } | { kind: 'end'; table: TableKey; count: number }
  | { kind: 'row'; table: TableKey; row: Record<string, unknown>; object?: string };

export function validateRow(key: TableKey, row: Record<string, unknown>): Record<string, unknown> {
  const revived = { ...row };
  for (const [name, column] of Object.entries(getTableColumns(backupTables[key]))) {
    if (column.dataType === 'date' && typeof revived[name] === 'string') revived[name] = new Date(revived[name] as string);
  }
  return validators[key].parse(revived);
}
/** Preserve PostgreSQL microseconds instead of truncating timestamps through JS Date. */
export function restoreRow(key: TableKey, raw: Record<string, unknown>) {
  const row = validateRow(key, raw);
  for (const [name, column] of Object.entries(getTableColumns(backupTables[key]))) {
    if (column.dataType === 'date' && typeof raw[name] === 'string') row[name] = sql`${raw[name]}`;
  }
  return row;
}

function archiveKey() {
  const secret = process.env.ACCESS_CODE_SECRET ?? '';
  if (secret.length < 16 && process.env.NODE_ENV === 'production') throw new Error('Encrypted backups require ACCESS_CODE_SECRET');
  return secret.length >= 16 ? createHash('sha256').update(secret + ':backup-stream-v1').digest() : null;
}

/** A repeatable-read cursor snapshot with bounded batches and stream backpressure. */
export async function writeArchive(database: typeof db, objects: ObjectStore, target: string, meta: Meta) {
  const key = archiveKey(), iv = randomBytes(12);
  const header = Buffer.from(JSON.stringify({ format: 'fdb1', schema: 8, ...meta, encrypted: !!key, iv: iv.toString('base64') }) + '\n');
  const cipher = key ? createCipheriv('aes-256-gcm', key, iv) : undefined;
  cipher?.setAAD(header);
  const temporary = target + '.tmp';
  try {
    await fs.writeFile(temporary, header, { mode: 0o600, flag: 'wx' });
    await database.transaction(async tx => {
      async function* records() {
        for (const [table, definition] of Object.entries(backupTables) as [TableKey, typeof backupTables[TableKey]][]) {
          yield JSON.stringify({ kind: 'table', table }) + '\n';
          const fields = Object.entries(getTableColumns(definition)).map(([name, column]) => sql`${column} AS ${sql.identifier(name)}`);
          await tx.execute(sql`DECLARE backup_cursor NO SCROLL CURSOR FOR SELECT ${sql.join(fields, sql`, `)} FROM ${definition}`);
          let count = 0;
          for (;;) {
            // Legacy inline documents may be large: only one document row at a time.
            const result = await tx.execute(sql.raw(`FETCH FORWARD ${table === 'signedActs' ? 1 : 250} FROM backup_cursor`));
            if (!result.rows.length) break;
            for (const row of result.rows) {
              for (const [name, column] of Object.entries(getTableColumns(definition))) {
                if (row[name] != null) row[name] = column.getSQLType() === 'date' && row[name] instanceof Date
                  ? row[name].toISOString().slice(0, 10) : column.dataType === 'number' ? column.mapFromDriverValue(row[name]) : row[name];
              }
              const object = table === 'signedActs' && typeof row.objectKey === 'string' ? (await objects.get(row.objectKey)).toString('base64') : undefined;
              const line = JSON.stringify({ kind: 'row', table, row, object }) + '\n';
              if (Buffer.byteLength(line) > MAX_LINE) throw new Error('Backup row exceeds the supported 20 MiB record size');
              yield line; count++;
            }
          }
          await tx.execute(sql`CLOSE backup_cursor`);
          yield JSON.stringify({ kind: 'end', table, count }) + '\n';
        }
      }
      const output = createWriteStream(temporary, { flags: 'a' });
      if (cipher) await pipeline(Readable.from(records(), { objectMode: false, highWaterMark: 64 * 1024 }), createGzip(), cipher, output);
      else await pipeline(Readable.from(records(), { objectMode: false, highWaterMark: 64 * 1024 }), createGzip(), output);
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    if (cipher) await fs.appendFile(temporary, cipher.getAuthTag());
    const handle = await fs.open(temporary, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, target);
  } catch (error) { await fs.rm(temporary, { force: true }); throw error; }
}

/** No full-file buffers. Authentication completes before the iterator finishes. */
export async function* readArchive(file: string): AsyncGenerator<ArchiveItem> {
  const handle = await fs.open(file, 'r');
  let output: PassThrough | undefined, done: Promise<void> | undefined;
  try {
    const size = (await handle.stat()).size;
    const probe = Buffer.alloc(Math.min(size, 4096));
    await handle.read(probe, 0, probe.length, 0);
    const newline = probe.indexOf(10);
    if (newline < 0) throw new Error('Invalid archive header');
    const header = probe.subarray(0, newline + 1);
    const meta = JSON.parse(header.toString());
    if (meta.format !== 'fdb1' || ![5, 6, 7, 8].includes(meta.schema) || typeof meta.encrypted !== 'boolean') throw new Error('Unsupported archive');
    const key = meta.encrypted ? archiveKey() : null;
    if (meta.encrypted && !key) throw new Error('Missing archive encryption key');
    const input = createReadStream(file, { fd: handle.fd, autoClose: false, start: header.length, end: size - 1 - (meta.encrypted ? 16 : 0) });
    output = new PassThrough();
    if (key) {
      const tag = Buffer.alloc(16); await handle.read(tag, 0, 16, size - 16);
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(meta.iv, 'base64'));
      decipher.setAAD(header); decipher.setAuthTag(tag);
      done = pipeline(input, decipher, createGunzip(), output);
    } else done = pipeline(input, createGunzip(), output);
    void done.catch(() => {});
    let pending = Buffer.alloc(0), ownerTransfers = false;
    for await (const chunk of output) {
      pending = Buffer.concat([pending, Buffer.from(chunk)]);
      let end: number;
      while ((end = pending.indexOf(10)) >= 0) {
        if (end > MAX_LINE) throw new Error('Archive record too large');
        const line = pending.subarray(0, end); pending = pending.subarray(end + 1);
        const item = JSON.parse(line.toString()) as ArchiveItem;
        if (meta.schema < 8 && item.kind === 'row') item.row = upgradeLegacyRow(item.table, item.row, meta.schema);
        if (item.table === 'ownerTransfers') ownerTransfers = true;
        yield item;
      }
      if (pending.length > MAX_LINE) throw new Error('Archive record too large');
    }
    await done;
    if (pending.length) throw new Error('Truncated archive record');
    // Owner transfers start at schema 8: older archives restore them as an empty table.
    if (meta.schema < 8 && !ownerTransfers) {
      yield { kind: 'table', table: 'ownerTransfers' };
      yield { kind: 'end', table: 'ownerTransfers', count: 0 };
    }
  } finally {
    output?.destroy();
    await done?.catch(() => {});
    await handle.close();
  }
}

export async function validateArchive(file: string) {
  let index = 0, count = 0, open = false;
  for await (const item of readArchive(file)) {
    if (!item || item.table !== tableKeys[index]) throw new Error('Missing, repeated or out-of-order backup table');
    if (item.kind === 'table' && !open) { open = true; count = 0; }
    else if (item.kind === 'end' && open && item.count === count) { open = false; index++; }
    else if (item.kind === 'row' && open) {
      const row = validateRow(item.table, item.row);
      if (item.table === 'signedActs' && row.objectKey) {
        if (!item.object || objectDigest(Buffer.from(item.object, 'base64')) !== row.objectKey) throw new Error('Missing or corrupt document in archive');
      } else if (item.object !== undefined) throw new Error('Unexpected archive object');
      count++;
    } else throw new Error('Invalid archive sequence or row count');
  }
  if (open || index !== tableKeys.length) throw new Error('Incomplete archive');
}
