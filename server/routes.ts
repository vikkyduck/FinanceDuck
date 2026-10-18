import { createDocumentStatusRouter } from './routes/documentStatus';
import { createLoginAttemptLimiter } from './rateLimiter';
import { DatabaseStorage } from "./storage";
import { db } from "./db";
import { InvoiceCommands } from "./services/invoiceCommands";
import { PaymentCommands } from "./services/paymentCommands";
import { BackupService } from "./backupService";
import { createAuthMiddleware } from "./middleware";
import { Express, Request, Response, NextFunction } from "express";
import { createAuthRouter } from "./routes/auth";
import { createClientsRouter } from "./routes/clients";
import { createPartnersRouter } from "./routes/partners";
import { createDashboardRouter } from "./routes/dashboard";
import { createInvoicesRouter } from "./routes/invoices";
import { createActsRouter } from "./routes/acts";
import { createRecurringRouter } from "./routes/recurring";
import { createExportRouter } from "./routes/export";
import { createBackupRouter } from "./routes/backup";
import { createActionLogRouter } from "./routes/actionLog";
import { createAssistantRouter } from "./routes/assistant";
import { createMyInvoicesRouter } from "./routes/myInvoices";
import { createMessagesRouter } from "./routes/messages";
import { createMeRouter } from "./routes/me";

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

export function registerRoutes(app: Express, database: typeof db = db, backups = new BackupService(database)): void {
  const storage = new DatabaseStorage(database);
  const invoiceCommands = new InvoiceCommands(database);
  const paymentCommands = new PaymentCommands(database);
  const authMiddleware = createAuthMiddleware(storage);
  app.use(createAuthRouter(storage, authMiddleware, createLoginAttemptLimiter(database)));
  app.use(createDocumentStatusRouter(authMiddleware, database));
  app.use(createClientsRouter(storage, authMiddleware));
  app.use(createPartnersRouter(storage, authMiddleware, paymentCommands));
  app.use(createDashboardRouter(storage, authMiddleware));
  app.use(createInvoicesRouter(storage, authMiddleware, database, invoiceCommands));
  app.use(createActsRouter(storage, authMiddleware));
  app.use(createRecurringRouter(storage, authMiddleware));
  app.use(createExportRouter(storage, authMiddleware));
  app.use(createBackupRouter(authMiddleware, backups));
  app.use(createActionLogRouter(storage, authMiddleware));
  app.use(createAssistantRouter(authMiddleware, database));
  app.use(createMyInvoicesRouter(storage, authMiddleware));
  app.use(createMessagesRouter(storage, authMiddleware, database));
  app.use(createMeRouter(storage, authMiddleware, database));
}
