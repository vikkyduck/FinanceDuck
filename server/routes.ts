import { Express, Request, Response, NextFunction } from "express";
import { authRouter } from "./routes/auth";
import { clientsRouter } from "./routes/clients";
import { partnersRouter } from "./routes/partners";
import { dashboardRouter } from "./routes/dashboard";
import { invoicesRouter } from "./routes/invoices";
import { actsRouter } from "./routes/acts";
import { recurringRouter } from "./routes/recurring";
import { exportRouter } from "./routes/export";
import { backupRouter } from "./routes/backup";
import { actionLogRouter } from "./routes/actionLog";
import { assistantRouter } from "./routes/assistant";
import { myInvoicesRouter } from "./routes/myInvoices";
import { messagesRouter } from "./routes/messages";
import { meRouter } from "./routes/me";

export function registerHealthCheck(app: Express) {
  // Health endpoints — для мониторинга и для фронта (useApiHealthCheck).
  // Корень "/" не перехватываем — пусть его отдаёт static/Vite middleware,
  // чтобы Telegram, WhatsApp и другие preview-боты получали HTML с meta-тегами.
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", timestamp: Date.now() });
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", timestamp: Date.now() });
  });
}

export function registerRoutes(app: Express): void {
  app.use(authRouter);
  app.use(clientsRouter);
  app.use(partnersRouter);
  app.use(dashboardRouter);
  app.use(invoicesRouter);
  app.use(actsRouter);
  app.use(recurringRouter);
  app.use(exportRouter);
  app.use(backupRouter);
  app.use(actionLogRouter);
  app.use(assistantRouter);
  app.use(myInvoicesRouter);
  app.use(messagesRouter);
  app.use(meRouter);
}
