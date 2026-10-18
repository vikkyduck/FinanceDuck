import { scheduledJobs } from '../shared/schema';
import { objectStore, objectDigest, type ObjectStore } from "./services/objectStore";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "./db";
import { decryptBackup, isEncryptedEnvelope } from "./lib/backupCrypto";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { backupTables, type TableKey, type Rows } from './services/backupTables';
export { backupTables } from './services/backupTables';
import { writeArchive, readArchive, validateArchive, validateRow, restoreRow, upgradeLegacyRow } from './services/backupArchive';
const BACKUP_DIR = process.env.BACKUP_DIR || "/var/finance-duck/backups";
// 30 ночных копий (~месяц). Было 7: «тихая» порча данных, не замеченная за
// неделю, переживала все чистые копии. Объём свободного диска контролирует оператор.
const MAX_AUTO_BACKUPS = 30;

export interface BackupInfo {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  type: "auto" | "manual";
}

export interface BackupData {
  version: "5.0";
  objects: Record<string, string>;
  createdAt: string;
  type: "auto" | "manual";
  data: Record<TableKey, Rows>;
}

/** Schema-directed revival: a date-shaped message or filename remains text. */
export function validateBackup(backup: unknown): BackupData {
  if (!backup || typeof backup !== "object") throw new Error("Неверный формат бэкапа");
  const value = backup as BackupData;
  if (!["2.0", "3.0", "4.0", "5.0"].includes(value.version)) throw new Error("Неполный или устаревший формат бэкапа. Автоматическое восстановление версии 1 запрещено");
  if (!value.data || !Number.isFinite(Date.parse(value.createdAt)) || !["auto", "manual"].includes(value.type)) {
    throw new Error("Неверные метаданные бэкапа");
  }
  const data = {} as BackupData["data"];
  for (const key of Object.keys(backupTables)) {
    const legacy = ["2.0", "3.0"].includes(String(value.version));
    const rows = key === "serviceUsage" && String(value.version) !== "5.0" ? [] : legacy && key === "scheduledJobs" ? [] : value.data[key as TableKey];
    if (!Array.isArray(rows)) throw new Error(`Отсутствует таблица ${key}`);
    data[key as TableKey] = rows.map(row => {
      const revived = { ...row };
      if (legacy && key === "signedActs" && !("objectKey" in revived)) revived.objectKey = null;
      if (legacy && key === "invoices" && !("recurringOccurrenceKey" in revived)) revived.recurringOccurrenceKey = null;
      return validateRow(key as TableKey, upgradeLegacyRow(key as TableKey, revived));
    });
  }
  // Old complete snapshots predate immutable occurrence keys. Preserve duplicate financial
  // rows and assign the canonical key to the earliest invoice, as migration 0002 does.
  if (String(value.version) !== '4.0' && value.data.invoices.some(row => !('recurringOccurrenceKey' in row))) {
    const used = new Set(data.invoices.map(row => row.recurringOccurrenceKey).filter(Boolean));
    const ordered = [...data.invoices].sort((a, b) => new Date(String(a.createdAt)).getTime() - new Date(String(b.createdAt)).getTime() || String(a.id).localeCompare(String(b.id)));
    for (const row of ordered) {
      if (!row.recurringInvoiceId || !row.issueDate || row.recurringOccurrenceKey) continue;
      const key = `${row.recurringInvoiceId}:${row.issueDate}`;
      if (!used.has(key)) { row.recurringOccurrenceKey = key; used.add(key); }
    }
  }
  if (String(value.version) !== '5.0') {
    for (const invoice of data.invoices) if (invoice.serviceType === 'periodic') {
      for (let period = 1; period <= Number(invoice.periodsUsed); period++) data.serviceUsage.push({
        id: randomUUID(), invoiceId: invoice.id, period, closed: true, source: 'legacy', closedAt: null,
        updatedAt: new Date(value.createdAt), updatedBy: null,
      });
    }
  }
  const objects = value.objects ?? {};
  for (const row of data.signedActs) {
    if (typeof row.objectKey !== 'string') continue;
    if (!/^[a-f0-9]{64}$/.test(row.objectKey) || typeof objects[row.objectKey] !== 'string' || objectDigest(Buffer.from(objects[row.objectKey], 'base64')) !== row.objectKey) throw new Error('Missing or corrupt document in backup');
  }
  return { ...value, version: '5.0', data, objects };
}

function parseBackupType(filename: string): "auto" | "manual" {
  return filename.startsWith("backup-auto-") ? "auto" : "manual";
}

export class BackupService {
  constructor(private readonly database = db, private readonly directory = BACKUP_DIR, private readonly objects: ObjectStore = objectStore) {}

  private async ensureDirectory() { await fs.mkdir(this.directory, { recursive: true, mode: 0o700 }); }

  async queueManualBackup() {
    const now = new Date();
    await this.database.insert(scheduledJobs).values({ key: 'manual-backup', nextRunAt: now })
      .onConflictDoUpdate({ target: scheduledJobs.key, set: { nextRunAt: now, state: 'idle', lastError: null, result: null },
        setWhere: sql`${scheduledJobs.state} <> 'running'` });
    return { message: 'Создание копии поставлено в очередь' };
  }

  async manualBackupStatus() {
    const [row] = await this.database.select().from(scheduledJobs).where(eq(scheduledJobs.key, 'manual-backup'));
    return row ? { state: row.state, pending: row.state === 'running' || row.state === 'failed' || row.nextRunAt <= new Date(),
      lastError: row.lastError ? 'Не удалось создать копию; повторная попытка запланирована' : null,
      filename: row.result ? (JSON.parse(row.result) as BackupInfo).filename : null } : { state: 'idle', pending: false };
  }

  async createBackup(type: "auto" | "manual" = "manual"): Promise<BackupInfo> {
    await this.ensureDirectory();
    const createdAt = new Date().toISOString();
    const filename = `backup-${type}-${createdAt.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
    const target = filename.replace(/\.json$/, '.fdb');
    await writeArchive(this.database, this.objects, path.join(this.directory, target), { createdAt, type });
    if (type === "auto") await this.cleanupOldBackups();
    return { id: target, filename: target, createdAt, type, sizeBytes: (await fs.stat(path.join(this.directory, target))).size };
  }

  async downloadPath(backupId: string): Promise<string | null> {
    if (!/^backup-[A-Za-z0-9._-]+\.(json|fdb)$/.test(backupId)) return null;
    const target = path.join(this.directory, backupId);
    try { await fs.access(target); return target; } catch { return null; }
  }

  async listBackups(): Promise<BackupInfo[]> {
    try {
      await this.ensureDirectory();
      const entries = await fs.readdir(this.directory);
      const backups: BackupInfo[] = [];

      for (const filename of entries) {
        if (!filename.startsWith("backup-") || !/(\.json|\.fdb)$/.test(filename)) continue;
        const filePath = path.join(this.directory, filename);
        const stat = await fs.stat(filePath);

        const createdAt = stat.mtime.toISOString();

        backups.push({
          id: filename,
          filename,
          createdAt,
          sizeBytes: stat.size,
          type: parseBackupType(filename),
        });
      }

      backups.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return backups;
    } catch (error) {
      console.error("[Backup] Error listing backups:", error);
      return [];
    }
  }

  async downloadBackup(backupId: string): Promise<BackupData | null> {
    try {
      const filePath = path.join(this.directory, path.basename(backupId));
      if (backupId.endsWith('.fdb')) {
        // Compatibility helper for small snapshots/tests. HTTP downloads always stream the archive.
        const data = Object.fromEntries(Object.keys(backupTables).map(key => [key, [] as Rows])) as BackupData['data'];
        const objects: Record<string, string> = {};
        let size = 0;
        for await (const item of readArchive(filePath)) {
          size += Buffer.byteLength(JSON.stringify(item));
          if (size > 64 * 1024 * 1024) throw new Error('Use streaming archive download for backups over 64 MiB');
          if (item.kind === 'row') {
            data[item.table].push(item.row);
            if (item.object && typeof item.row.objectKey === 'string') objects[item.row.objectKey] = item.object;
          }
        }
        return { version: '5.0', createdAt: (await fs.stat(filePath)).mtime.toISOString(), type: parseBackupType(backupId), data, objects };
      }
      if ((await fs.stat(filePath)).size > 64 * 1024 * 1024) throw new Error('Legacy JSON backup exceeds 64 MiB; convert it offline before restore');
      const content = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      // Зашифрованный конверт → расшифровать; легаси открытый JSON → как есть.
      if (isEncryptedEnvelope(parsed)) {
        return JSON.parse(decryptBackup(parsed)) as BackupData;
      }
      return parsed as BackupData;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") {
        console.error("[Backup] Read failed:", error instanceof Error ? error.name : "UnknownError");
      }
      return null;
    }
  }

  async restoreBackup(
    backupId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (backupId.endsWith('.fdb')) return await this.restoreArchive(backupId);
      const backupData = await this.downloadBackup(backupId);
      if (!backupData) {
        // downloadBackup вернул null: файл не найден ИЛИ расшифровка/парсинг не удались.
        return { success: false, message: "Бэкап не найден или повреждён (не удалось прочитать)" };
      }

      const validated = validateBackup(backupData);
      // Repair missing immutable files from the verified archive before creating the
      // protective snapshot: otherwise loss of the object volume would block recovery.
      for (const [key, encoded] of Object.entries(validated.objects)) {
        const data = Buffer.from(encoded, 'base64');
        if (objectDigest(data) !== key) throw new Error('Corrupt document object');
        await this.objects.put(data);
      }
      await this.createBackup("manual");
      await this.database.transaction(async tx => {
        const tables = Object.values(backupTables);
        await tx.execute(sql`LOCK TABLE ${sql.join(tables.map(table => sql`${table}`), sql`, `)} IN ACCESS EXCLUSIVE MODE`);
        for (const table of [...tables].reverse()) await tx.delete(table);
        for (const [key, table] of Object.entries(backupTables)) {
          const rows = validated.data[key as TableKey];
          // Restoring data must not resurrect old authenticated sessions.
          const restored = key === "userSessions" ? rows.map(row => ({ ...row, revoked: true })) : rows;
          for (let offset = 0; offset < restored.length; offset += 250) {
            await tx.insert(table).values(restored.slice(offset, offset + 250));
          }
        }
      });

      console.log(`[Backup] Restore completed successfully`);
      return { success: true, message: "Данные успешно восстановлены. Все сессии отозваны; войдите заново" };
    } catch (error) {
      console.error("[Backup] Restore failed:", error instanceof Error ? error.name : 'UnknownError');
      return { success: false, message: "Не удалось восстановить копию. Проверьте формат, ключ шифрования и доступность базы" };
    }
  }

  private async restoreArchive(backupId: string) {
    const file = await this.downloadPath(backupId);
    if (!file) throw new Error('Backup not found');
    // Complete authenticated preflight before any backup, SQL change or object publication.
    await validateArchive(file);
    // Verified objects can safely repair a lost volume without changing financial facts.
    // Do this before the protective backup, which must read current document references.
    for await (const item of readArchive(file)) if (item.kind === 'row' && item.object) await this.objects.put(Buffer.from(item.object, 'base64'));
    await this.createBackup('manual');
    await this.database.transaction(async tx => {
      const tables = Object.values(backupTables);
      await tx.execute(sql`LOCK TABLE ${sql.join(tables.map(table => sql`${table}`), sql`, `)} IN ACCESS EXCLUSIVE MODE`);
      for (const table of [...tables].reverse()) await tx.delete(table);
      let batch: Rows = [], tableKey: TableKey | undefined, bytes = 0;
      const flush = async () => {
        if (tableKey && batch.length) await tx.insert(backupTables[tableKey]).values(batch);
        batch = []; bytes = 0;
      };
      for await (const item of readArchive(file)) {
        if (item.kind !== 'row') { await flush(); continue; }
        if (tableKey !== item.table) { await flush(); tableKey = item.table; }
        const row = restoreRow(item.table, item.row);
        if (item.table === 'userSessions') row.revoked = true;
        batch.push(row); bytes += Buffer.byteLength(JSON.stringify(item.row));
        if (batch.length >= 250 || bytes >= 1024 * 1024) await flush();
      }
      await flush();
      const mismatch = await tx.execute(sql`SELECT i.id FROM invoices i WHERE i.service_type = 'periodic' AND i.periods_used <> (SELECT count(*) FROM service_usage u WHERE u.invoice_id = i.id AND u.closed) LIMIT 1`);
      if (mismatch.rows.length) throw new Error('Service usage ledger does not match invoice projection');
    });
    return { success: true, message: 'Данные успешно восстановлены. Все сессии отозваны; войдите заново' };
  }

  async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const filePath = path.join(this.directory, path.basename(backupId));
      await fs.unlink(filePath);
      console.log(`[Backup] Deleted backup: ${backupId}`);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return false;
      console.error("[Backup] Error deleting backup:", error);
      return false;
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();
      const autoBackups = backups.filter((b) => b.type === "auto");

      if (autoBackups.length > MAX_AUTO_BACKUPS) {
        const toDelete = autoBackups.slice(MAX_AUTO_BACKUPS);
        for (const backup of toDelete) {
          await this.deleteBackup(backup.id);
          console.log(`[Backup] Cleaned up old backup: ${backup.filename}`);
        }
      }
    } catch (error) {
      console.error("[Backup] Error cleaning up old backups:", error);
    }
  }
}

export const backupService = new BackupService();
