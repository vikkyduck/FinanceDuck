import { Router, Response } from "express";
import { storage } from "../storage";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware";

export const actionLogRouter = Router();

actionLogRouter.get("/api/assistant-logs", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const role = req.query.role as "admin" | "assistant" | "accountant" | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    res.json(await storage.getAssistantActionLogs({ limit, offset, role: role || null, dateFrom: dateFrom || null, dateTo: dateTo || null }));
  } catch (error: any) {
    console.error("Get assistant logs error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch assistant action logs" });
  }
});

actionLogRouter.get("/api/accountant-logs", authMiddleware, requireRole("accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    res.json(await storage.getAssistantActionLogs({ limit, offset, role: "accountant", dateFrom: null, dateTo: null }));
  } catch (error: any) {
    console.error("Get accountant logs error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch accountant action logs" });
  }
});
