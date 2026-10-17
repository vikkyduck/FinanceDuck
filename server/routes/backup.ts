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

backupRouter.post("/api/backups", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await backupService.createBackup("manual")); }
  catch (error: unknown) { console.error("Create backup error:", error); res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to create backup" }); }
});

backupRouter.get("/api/backups/:id/download", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backupId = decodeURIComponent(req.params.id);
    const backup = await backupService.downloadBackup(backupId);
    if (!backup) return res.status(404).json({ error: "Backup not found" });
    res.setHeader("Content-Type", "application/json");
    // Санитизируем имя файла: только безопасные символы — иначе CR/LF/кавычки
    // в id могли бы инъектировать заголовки (header injection).
    const safeName = (backupId.split("/").pop() || "backup.json").replace(/[^A-Za-z0-9._-]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.json(backup);
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
