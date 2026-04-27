import { Router, Response } from "express";
import { backupService } from "../backupService";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware";

export const backupRouter = Router();

backupRouter.get("/api/backups", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await backupService.listBackups()); }
  catch (error: any) { console.error("List backups error:", error); res.status(500).json({ error: error.message || "Failed to list backups" }); }
});

backupRouter.post("/api/backups", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await backupService.createBackup("manual")); }
  catch (error: any) { console.error("Create backup error:", error); res.status(500).json({ error: error.message || "Failed to create backup" }); }
});

backupRouter.get("/api/backups/:id/download", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backupId = decodeURIComponent(req.params.id);
    const backup = await backupService.downloadBackup(backupId);
    if (!backup) return res.status(404).json({ error: "Backup not found" });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=${backupId.split("/").pop()}`);
    res.json(backup);
  } catch (error: any) { console.error("Download backup error:", error); res.status(500).json({ error: error.message || "Failed to download backup" }); }
});

backupRouter.post("/api/backups/:id/restore", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backupId = decodeURIComponent(req.params.id);
    const result = await backupService.restoreBackup(backupId);
    if (!result.success) return res.status(400).json({ error: result.message });
    res.json({ message: result.message });
  } catch (error: any) { console.error("Restore backup error:", error); res.status(500).json({ error: error.message || "Failed to restore backup" }); }
});

backupRouter.delete("/api/backups/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backupId = decodeURIComponent(req.params.id);
    const deleted = await backupService.deleteBackup(backupId);
    if (!deleted) return res.status(404).json({ error: "Backup not found" });
    res.status(204).send();
  } catch (error: any) { console.error("Delete backup error:", error); res.status(500).json({ error: error.message || "Failed to delete backup" }); }
});
