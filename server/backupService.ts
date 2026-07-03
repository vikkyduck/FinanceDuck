import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "./db";
import { backupCryptoEnabled, encryptBackup, decryptBackup, isEncryptedEnvelope } from "./lib/backupCrypto";
import {
  invoices,
  clients,
  partners,
  partnerPayments,
  invoiceExpenses,
  invoiceCalculations,
  accessTokens,
  recurringInvoices,
} from "../shared/schema";

const BACKUP_DIR = process.env.BACKUP_DIR || "/var/finance-duck/backups";
const MAX_AUTO_BACKUPS = 7;

export interface BackupInfo {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  type: "auto" | "manual";
}

export interface BackupData {
  version: string;
  createdAt: string;
  type: "auto" | "manual";
  data: {
    invoices: any[];
    clients: any[];
    partners: any[];
    partnerPayments: any[];
    invoiceExpenses: any[];
    invoiceCalculations: any[];
    accessTokens: any[];
    recurringInvoices: any[];
  };
}

async function ensureBackupDir(): Promise<void> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

// JSON serializes Dates as ISO strings. Drizzle's timestamp columns expect
// Date objects on insert (it calls .toISOString() internally). Walk the row
// and convert ISO-looking strings back to Date so restore round-trips cleanly.
const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
function reviveDates<T extends Record<string, any>>(row: T): T {
  for (const key of Object.keys(row)) {
    const v = row[key];
    if (typeof v === "string" && ISO_DATE_RX.test(v)) {
      (row as any)[key] = new Date(v);
    }
  }
  return row;
}

function parseBackupType(filename: string): "auto" | "manual" {
  return filename.startsWith("backup-auto-") ? "auto" : "manual";
}

// Таблицы, которые обязаны присутствовать (массивами) в валидном бэкапе.
const REQUIRED_BACKUP_TABLES = [
  "invoices", "clients", "partners", "partnerPayments",
  "invoiceExpenses", "invoiceCalculations", "accessTokens", "recurringInvoices",
] as const;

/**
 * Проверка структуры бэкапа ПЕРЕД деструктивным restore. Возвращает текст
 * ошибки или null. Нужна потому, что restore сначала стирает все таблицы —
 * битый/обрезанный/подменённый файл иначе оставил бы прод пустым.
 */
function validateBackupStructure(backup: any): string | null {
  if (!backup || typeof backup !== "object") return "файл не является объектом бэкапа";
  if (!backup.data || typeof backup.data !== "object") return "отсутствует секция data";
  for (const table of REQUIRED_BACKUP_TABLES) {
    if (!Array.isArray(backup.data[table])) return `таблица «${table}» отсутствует или не массив`;
  }
  return null;
}

export class BackupService {
  async createBackup(type: "auto" | "manual" = "manual"): Promise<BackupInfo> {
    await ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${type}-${timestamp}.json`;
    const filePath = path.join(BACKUP_DIR, filename);

    const [
      allInvoices,
      allClients,
      allPartners,
      allPayments,
      allExpenses,
      allCalculations,
      allTokens,
      allRecurring,
    ] = await Promise.all([
      db.select().from(invoices),
      db.select().from(clients),
      db.select().from(partners),
      db.select().from(partnerPayments),
      db.select().from(invoiceExpenses),
      db.select().from(invoiceCalculations),
      db.select().from(accessTokens),
      db.select().from(recurringInvoices),
    ]);

    const backupData: BackupData = {
      version: "1.0",
      createdAt: new Date().toISOString(),
      type,
      data: {
        invoices: allInvoices,
        clients: allClients,
        partners: allPartners,
        partnerPayments: allPayments,
        invoiceExpenses: allExpenses,
        invoiceCalculations: allCalculations,
        accessTokens: allTokens,
        recurringInvoices: allRecurring,
      },
    };

    const jsonContent = JSON.stringify(backupData, null, 2);
    // Шифруем содержимое, если задан секрет. Конверт хранит createdAt/type
    // открыто (для списка), а сами данные — в ciphertext.
    const fileContent = backupCryptoEnabled
      ? JSON.stringify(encryptBackup(jsonContent, { createdAt: backupData.createdAt, type }))
      : jsonContent;
    await fs.writeFile(filePath, fileContent, "utf8");

    console.log(`[Backup] Created backup: ${filename}${backupCryptoEnabled ? " (encrypted)" : ""}`);

    if (type === "auto") {
      await this.cleanupOldBackups();
    }

    return {
      id: filename,
      filename,
      createdAt: backupData.createdAt,
      sizeBytes: Buffer.byteLength(fileContent, "utf8"),
      type,
    };
  }

  async listBackups(): Promise<BackupInfo[]> {
    try {
      await ensureBackupDir();
      const entries = await fs.readdir(BACKUP_DIR);
      const backups: BackupInfo[] = [];

      for (const filename of entries) {
        if (!filename.startsWith("backup-") || !filename.endsWith(".json")) continue;
        const filePath = path.join(BACKUP_DIR, filename);
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
      const filePath = path.join(BACKUP_DIR, path.basename(backupId));
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

      // ВАЛИДАЦИЯ ДО удаления: не стираем прод из-за битого файла.
      const structErr = validateBackupStructure(backupData);
      if (structErr) {
        return { success: false, message: `Восстановление отменено: ${structErr}` };
      }

      console.log(`[Backup] Starting restore from: ${backupId}`);

      await db.transaction(async (tx) => {
        await tx.delete(invoiceCalculations);
        await tx.delete(invoiceExpenses);
        await tx.delete(partnerPayments);
        await tx.delete(recurringInvoices);
        await tx.delete(invoices);
        await tx.delete(clients);
        await tx.delete(partners);
        await tx.delete(accessTokens);

        if (backupData.data.partners?.length) {
          await tx.insert(partners).values(backupData.data.partners.map(reviveDates));
        }
        if (backupData.data.clients?.length) {
          await tx.insert(clients).values(backupData.data.clients.map(reviveDates));
        }
        if (backupData.data.accessTokens?.length) {
          await tx.insert(accessTokens).values(backupData.data.accessTokens.map(reviveDates));
        }
        if (backupData.data.invoices?.length) {
          await tx.insert(invoices).values(backupData.data.invoices.map(reviveDates));
        }
        if (backupData.data.invoiceExpenses?.length) {
          await tx.insert(invoiceExpenses).values(backupData.data.invoiceExpenses.map(reviveDates));
        }
        if (backupData.data.invoiceCalculations?.length) {
          await tx
            .insert(invoiceCalculations)
            .values(backupData.data.invoiceCalculations.map(reviveDates));
        }
        if (backupData.data.partnerPayments?.length) {
          await tx.insert(partnerPayments).values(backupData.data.partnerPayments.map(reviveDates));
        }
        if (backupData.data.recurringInvoices?.length) {
          await tx
            .insert(recurringInvoices)
            .values(backupData.data.recurringInvoices.map(reviveDates));
        }
      });

      console.log(`[Backup] Restore completed successfully`);
      return { success: true, message: "Данные успешно восстановлены" };
    } catch (error) {
      console.error("[Backup] Error restoring backup:", error);
      return { success: false, message: `Ошибка восстановления: ${error}` };
    }
  }

  async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const filePath = path.join(BACKUP_DIR, path.basename(backupId));
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
