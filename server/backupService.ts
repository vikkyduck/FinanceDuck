import { objectStorageClient } from "./objectStorage";
import { db } from "./db";
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

const BACKUP_BUCKET_NAME = process.env.BACKUP_BUCKET_NAME || "";
const BACKUP_PREFIX = "backups/";
const MAX_BACKUPS = 7;

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

export class BackupService {
  private getBucketName(): string {
    if (!BACKUP_BUCKET_NAME) {
      throw new Error(
        "BACKUP_BUCKET_NAME not set. Create a bucket in 'Object Storage' tool and set BACKUP_BUCKET_NAME env var."
      );
    }
    return BACKUP_BUCKET_NAME;
  }

  async createBackup(type: "auto" | "manual" = "manual"): Promise<BackupInfo> {
    const bucketName = this.getBucketName();
    const bucket = objectStorageClient.bucket(bucketName);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${type}-${timestamp}.json`;
    const objectName = `${BACKUP_PREFIX}${filename}`;
    
    const allInvoices = await db.select().from(invoices);
    const allClients = await db.select().from(clients);
    const allPartners = await db.select().from(partners);
    const allPayments = await db.select().from(partnerPayments);
    const allExpenses = await db.select().from(invoiceExpenses);
    const allCalculations = await db.select().from(invoiceCalculations);
    const allTokens = await db.select().from(accessTokens);
    const allRecurring = await db.select().from(recurringInvoices);
    
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
    const file = bucket.file(objectName);
    
    await file.save(jsonContent, {
      contentType: "application/json",
      metadata: {
        backupType: type,
        createdAt: backupData.createdAt,
      },
    });
    
    console.log(`[Backup] Created backup: ${filename}`);
    
    if (type === "auto") {
      await this.cleanupOldBackups();
    }
    
    return {
      id: objectName,
      filename,
      createdAt: backupData.createdAt,
      sizeBytes: Buffer.byteLength(jsonContent, "utf8"),
      type,
    };
  }

  async listBackups(): Promise<BackupInfo[]> {
    try {
      const bucketName = this.getBucketName();
      const bucket = objectStorageClient.bucket(bucketName);
      
      const [files] = await bucket.getFiles({
        prefix: BACKUP_PREFIX,
      });
      
      const backups: BackupInfo[] = [];
      
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const filename = file.name.replace(BACKUP_PREFIX, "");
        
        const typeMatch = filename.match(/backup-(auto|manual)-/);
        const type = (typeMatch?.[1] as "auto" | "manual") || "manual";
        
        backups.push({
          id: file.name,
          filename,
          createdAt: String(metadata.metadata?.createdAt || metadata.timeCreated || ""),
          sizeBytes: parseInt(String(metadata.size) || "0", 10),
          type,
        });
      }
      
      backups.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      return backups;
    } catch (error) {
      console.error("[Backup] Error listing backups:", error);
      return [];
    }
  }

  async downloadBackup(backupId: string): Promise<BackupData | null> {
    try {
      const bucketName = this.getBucketName();
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(backupId);
      
      const [exists] = await file.exists();
      if (!exists) {
        return null;
      }
      
      const [content] = await file.download();
      return JSON.parse(content.toString("utf8"));
    } catch (error) {
      console.error("[Backup] Error downloading backup:", error);
      return null;
    }
  }

  async getBackupDownloadUrl(backupId: string): Promise<string | null> {
    try {
      const bucketName = this.getBucketName();
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(backupId);
      
      const [exists] = await file.exists();
      if (!exists) {
        return null;
      }
      
      const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 15 * 60 * 1000,
      });
      
      return signedUrl;
    } catch (error) {
      console.error("[Backup] Error getting download URL:", error);
      return null;
    }
  }

  async restoreBackup(backupId: string): Promise<{ success: boolean; message: string }> {
    try {
      const backupData = await this.downloadBackup(backupId);
      if (!backupData) {
        return { success: false, message: "Бэкап не найден" };
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
        
        if (backupData.data.partners?.length > 0) {
          await tx.insert(partners).values(backupData.data.partners);
        }
        if (backupData.data.clients?.length > 0) {
          await tx.insert(clients).values(backupData.data.clients);
        }
        if (backupData.data.accessTokens?.length > 0) {
          await tx.insert(accessTokens).values(backupData.data.accessTokens);
        }
        if (backupData.data.invoices?.length > 0) {
          await tx.insert(invoices).values(backupData.data.invoices);
        }
        if (backupData.data.invoiceExpenses?.length > 0) {
          await tx.insert(invoiceExpenses).values(backupData.data.invoiceExpenses);
        }
        if (backupData.data.invoiceCalculations?.length > 0) {
          await tx.insert(invoiceCalculations).values(backupData.data.invoiceCalculations);
        }
        if (backupData.data.partnerPayments?.length > 0) {
          await tx.insert(partnerPayments).values(backupData.data.partnerPayments);
        }
        if (backupData.data.recurringInvoices?.length > 0) {
          await tx.insert(recurringInvoices).values(backupData.data.recurringInvoices);
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
      const bucketName = this.getBucketName();
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(backupId);
      
      const [exists] = await file.exists();
      if (!exists) {
        return false;
      }
      
      await file.delete();
      console.log(`[Backup] Deleted backup: ${backupId}`);
      return true;
    } catch (error) {
      console.error("[Backup] Error deleting backup:", error);
      return false;
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();
      const autoBackups = backups.filter((b) => b.type === "auto");
      
      if (autoBackups.length > MAX_BACKUPS) {
        const toDelete = autoBackups.slice(MAX_BACKUPS);
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
