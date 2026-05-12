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

export function registerHealthCheck(app: Express) {
  app.get("/", (req: Request, res: Response, next: NextFunction) => {
    const userAgent = req.headers["user-agent"] || "";
    const acceptHeader = req.headers["accept"] || "";
    if (!userAgent || userAgent.includes("HealthCheck") || userAgent.includes("kube-probe") || userAgent.includes("curl") || !acceptHeader.includes("text/html")) {
      return res.status(200).send("OK");
    }
    next();
  });

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
}
