import { objectStore, objectDigest, type ObjectStore } from "./services/objectStore";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "./db";
import { backupCryptoEnabled, encryptBackup, decryptBackup, isEncryptedEnvelope } from "./lib/backupCrypto";
import { randomUUID } from "node:crypto";
import { getTableColumns, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import * as schema from "../shared/schema";

// Foreign-key order. Every persisted application table belongs here.
export const backupTables = {
  partners: schema.partners, clients: schema.clients,
  clientPartners: schema.clientPartners, accessTokens: schema.accessTokens,
  recurringInvoices: schema.recurringInvoices, invoices: schema.invoices,
  invoiceCalculations: schema.invoiceCalculations, invoiceExpenses: schema.invoiceExpenses,
  invoiceTransfers: schema.invoiceTransfers, partnerPayments: schema.partnerPayments,
  signedActs: schema.signedActs, invoiceMessages: schema.invoiceMessages,
  assistantBonusPayments: schema.assistantBonusPayments,
  monthlyFinancialPlans: schema.monthlyFinancialPlans,
  assistantActionLogs: schema.assistantActionLogs, loginRateLimits: schema.loginRateLimits,
  userSessions: schema.userSessions,
  invoiceNumberCounters: schema.invoiceNumberCounters,
  notificationOutbox: schema.notificationOutbox,
  commandReceipts: schema.commandReceipts,
  scheduledJobs: schema.scheduledJobs,
} as const;
type TableKey = keyof typeof backupTables;
type Rows = Record<string, unknown>[];

const BACKUP_DIR = process.env.BACKUP_DIR || "/var/finance-duck/backups";
// 30 ночных копий (~месяц). Было 7: «тихая» порча данных, не замеченная за
// неделю, переживала все чистые копии. Дампы маленькие — диск не страдает.
const MAX_AUTO_BACKUPS = 30;

export interface BackupInfo {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  type: "auto" | "manual";
}

export interface BackupData {
  version: "4.0";
  objects: Record<string, string>;
  createdAt: string;
  type: "auto" | "manual";
  data: Record<TableKey, Rows>;
}

/** Schema-directed revival: a date-shaped message or filename remains text. */
export function validateBackup(backup: unknown): BackupData {
  if (!backup || typeof backup !== "object") throw new Error("Неверный формат бэкапа");
  const value = backup as BackupData;
  if (!["2.0", "3.0", "4.0"].includes(value.version)) throw new Error("Неполный или устаревший формат бэкапа. Автоматическое восстановление версии 1 запрещено");
  if (!value.data || !Number.isFinite(Date.parse(value.createdAt)) || !["auto", "manual"].includes(value.type)) {
    throw new Error("Неверные метаданные бэкапа");
  }
  const data = {} as BackupData["data"];
  for (const [key, table] of Object.entries(backupTables)) {
    const legacy = String(value.version) !== "4.0";
    const rows = legacy && key === "scheduledJobs" ? [] : value.data[key as TableKey];
    if (!Array.isArray(rows)) throw new Error(`Отсутствует таблица ${key}`);
    const columns = getTableColumns(table);
    const validator = createSelectSchema(table).strict();
    data[key as TableKey] = rows.map(row => {
      const revived = { ...row };
      if (legacy && key === "signedActs" && !("objectKey" in revived)) revived.objectKey = null;
      if (legacy && key === "invoices" && !("recurringOccurrenceKey" in revived)) revived.recurringOccurrenceKey = null;
      for (const [name, column] of Object.entries(columns)) {
        if (column.dataType === "date" && typeof revived[name] === "string") {
          revived[name] = new Date(revived[name] as string);
        }
      }
      return validator.parse(revived);
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
  const objects = value.objects ?? {};
  for (const row of data.signedActs) {
    if (typeof row.objectKey !== 'string') continue;
    if (!/^[a-f0-9]{64}$/.test(row.objectKey) || typeof objects[row.objectKey] !== 'string' || objectDigest(Buffer.from(objects[row.objectKey], 'base64')) !== row.objectKey) throw new Error('Missing or corrupt document in backup');
  }
  return { ...value, version: '4.0', data, objects };
}

function parseBackupType(filename: string): "auto" | "manual" {
  return filename.startsWith("backup-auto-") ? "auto" : "manual";
}

export class BackupService {
  constructor(private readonly database = db, private readonly directory = BACKUP_DIR, private readonly objects: ObjectStore = objectStore) {}

  private async ensureDirectory() { await fs.mkdir(this.directory, { recursive: true, mode: 0o700 }); }

  async createBackup(type: "auto" | "manual" = "manual"): Promise<BackupInfo> {
    await this.ensureDirectory();
    const createdAt = new Date().toISOString();
    const filename = `backup-${type}-${createdAt.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
    const data = await this.database.transaction(async tx => {
      const snapshot = {} as BackupData["data"];
      for (const [key, table] of Object.entries(backupTables)) {
        snapshot[key as TableKey] = await tx.select().from(table);
      }
      return snapshot;
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    const objects: Record<string, string> = {};
    for (const row of data.signedActs) if (typeof row.objectKey === 'string' && !objects[row.objectKey]) objects[row.objectKey] = (await this.objects.get(row.objectKey)).toString('base64');
    const backup: BackupData = { version: "4.0", createdAt, type, data, objects };
    const json = JSON.stringify(backup);
    const content = backupCryptoEnabled ? JSON.stringify(encryptBackup(json, { createdAt, type })) : json;
    // Atomic publish: an interrupted write never appears as a restorable file.
    const temporary = path.join(this.directory, `${filename}.tmp`);
    await fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(temporary, path.join(this.directory, filename));
    if (type === "auto") await this.cleanupOldBackups();
    return { id: filename, filename, createdAt, type, sizeBytes: Buffer.byteLength(content) };
  }

  async listBackups(): Promise<BackupInfo[]> {
    try {
      await this.ensureDirectory();
      const entries = await fs.readdir(this.directory);
      const backups: BackupInfo[] = [];

      for (const filename of entries) {
        if (!filename.startsWith("backup-") || !filename.endsWith(".json")) continue;
        const filePath = path.join(this.directory, filename);
        const stat = await fs.stat(filePath);

        let createdAt = stat.mtime.toISOString();
        try {
          const head = await fs.readFile(filePath, "utf8");
          const parsed = JSON.parse(head) as Partial<BackupData>;
          if (parsed?.createdAt) createdAt = parsed.createdAt;
        } catch {
          // If file is corrupt, fall back to mtime.
        }

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
        console.error("[Backup] Error downloading backup:", error);
      }
      return null;
    }
  }

  async restoreBackup(
    backupId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const backupData = await this.downloadBackup(backupId);
      if (!backupData) {
        // downloadBackup вернул null: файл не найден ИЛИ расшифровка/парсинг не удались.
        return { success: false, message: "Бэкап не найден или повреждён (не удалось прочитать)" };
      }

      const validated = validateBackup(backupData);
      // Keep a complete recovery point before replacing any records.
      await this.createBackup("manual");
      // Publish immutable, hash-verified files before making database references live.
      for (const [key, encoded] of Object.entries(validated.objects)) {
        const data = Buffer.from(encoded, 'base64');
        if (objectDigest(data) !== key) throw new Error('Corrupt document object');
        await this.objects.put(data);
      }
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
      console.error("[Backup] Error restoring backup:", error);
      return { success: false, message: `Ошибка восстановления: ${error}` };
    }
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
