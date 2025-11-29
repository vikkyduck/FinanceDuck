import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { app } from "./index";
import { storage } from "./storage";

const isProduction = process.env.NODE_ENV === "production";

const RECURRING_CHECK_INTERVAL = 60 * 60 * 1000;
const INITIAL_DELAY = 30000;

async function processRecurringInvoices() {
  try {
    const result = await storage.processAllDueRecurringInvoices();
    if (result.created > 0) {
      console.log(`[Recurring] Created ${result.created} draft invoice(s) from recurring templates`);
    }
    if (result.errors.length > 0) {
      console.error(`[Recurring] Errors:`, result.errors);
    }
  } catch (error) {
    console.error("[Recurring] Failed to process recurring invoices:", error);
  }
}

function startRecurringInvoiceScheduler() {
  console.log("[Recurring] Scheduler will start in 30 seconds");
  
  setTimeout(() => {
    console.log("[Recurring] Running initial check");
    processRecurringInvoices();
    
    setInterval(() => {
      processRecurringInvoices();
    }, RECURRING_CHECK_INTERVAL);
  }, INITIAL_DELAY);
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    await setupVite(server, vite);
  }

  const port = 5000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
    
    startRecurringInvoiceScheduler();
  });
})();
