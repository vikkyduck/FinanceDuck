import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import type { ViteDevServer } from "vite";
import { app } from "./index";
import { storage } from "./storage";
import { backupService } from "./backupService";
import { startOutboxWorker } from "./services/outbox";

const isProduction = process.env.NODE_ENV === "production";
const RECURRING_CHECK_INTERVAL = 60 * 60 * 1000;
const BACKUP_CHECK_INTERVAL = 60 * 60 * 1000;

async function processRecurringInvoicesQuietly() {
  try {
    const result = await storage.processAllDueRecurringInvoices();
    if (result.errors.length) console.error("[Recurring] Failed occurrences:", result.errors);
    if (result.created > 0) {
      console.log(`[Recurring] Created ${result.created} draft(s)`);
    }
  } catch (error) {
    console.error("[Recurring] Error:", error);
  }
}

function startRecurringSchedulerLazy() {
  setTimeout(() => {
    console.log("[Recurring] Starting scheduler");
    processRecurringInvoicesQuietly();
    setInterval(processRecurringInvoicesQuietly, RECURRING_CHECK_INTERVAL);
  }, 60000);
}

let lastBackupDate: string | null = null;

async function checkAndRunDailyBackup() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const today = now.toISOString().split('T')[0];
    
    if (currentHour === 3 && lastBackupDate !== today) {
      console.log("[Backup] Running daily automatic backup...");
      const backup = await backupService.createBackup("auto");
      console.log(`[Backup] Daily backup completed: ${backup.filename}`);
      lastBackupDate = today;
    }
  } catch (error) {
    console.error("[Backup] Daily backup error:", error);
  }
}

function startBackupSchedulerLazy() {
  setTimeout(() => {
    console.log("[Backup] Starting backup scheduler (daily at 3:00)");
    checkAndRunDailyBackup();
    setInterval(checkAndRunDailyBackup, BACKUP_CHECK_INTERVAL);
  }, 120000);
}

async function setupVite(server: Express, vite: ViteDevServer) {
  server.use(vite.middlewares);
  server.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "index.html"
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = await vite.transformIndexHtml(url, template);

      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

function serveStatic(server: Express) {
  const distPath = path.resolve(import.meta.dirname, "..", "dist");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  server.use(express.static(distPath));

  server.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

(async () => {
  const server = app;

  if (isProduction) {
    serveStatic(server);
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    await setupVite(server, vite);
  }

  const port = Number(process.env.PORT ?? 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.listen(port, process.env.HOST ?? "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
    startOutboxWorker();
    startRecurringSchedulerLazy();
    startBackupSchedulerLazy();
  });
})();
