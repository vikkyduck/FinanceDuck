import type { AuthMiddleware } from "../middleware";
import { Router, Response } from "express";
import type { BackupService } from "../backupService";
import { AuthenticatedRequest, requireRole } from "../middleware";

export function createBackupRouter(authMiddleware: AuthMiddleware, backupService: BackupService) {
const backupRouter = Router();

backupRouter.get("/api/backups", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await backupService.listBackups()); }
  catch (error: unknown) { console.error("List backups error:", error); res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to list backups" }); }
});

backupRouter.get("/api/backups/status", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await backupService.manualBackupStatus()); }
  catch { res.status(500).json({ error: 'Не удалось получить статус копирования' }); }
});

backupRouter.post("/api/backups", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.status(202).json(await backupService.queueManualBackup()); }
  catch (error: unknown) { console.error("Create backup error:", error); res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to create backup" }); }
});

backupRouter.get("/api/backups/:id/download", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backupId = decodeURIComponent(req.params.id);
    const file = await backupService.downloadPath(backupId);
    if (!file) return res.status(404).json({ error: "Backup not found" });
    res.download(file, backupId);

  } catch (error: unknown) { console.error("Download backup error:", error); res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to download backup" }); }
});

backupRouter.post("/api/backups/:id/restore", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backupId = decodeURIComponent(req.params.id);
    const result = await backupService.restoreBackup(backupId);
    if (!result.success) return res.status(400).json({ error: result.message });
    res.json({ message: result.message });
  } catch (error: unknown) { console.error("Restore backup error:", error); res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to restore backup" }); }
});

backupRouter.delete("/api/backups/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backupId = decodeURIComponent(req.params.id);
    const deleted = await backupService.deleteBackup(backupId);
    if (!deleted) return res.status(404).json({ error: "Backup not found" });
    res.status(204).send();
  } catch (error: unknown) { console.error("Delete backup error:", error); res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to delete backup" }); }
});

return backupRouter;
}
