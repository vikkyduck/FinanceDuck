import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import type { ViteDevServer } from "vite";
import { app } from "./index";
import { listenHost } from "./listenConfig";

const isProduction = process.env.NODE_ENV === "production";
const host = listenHost();

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
  server.listen(port, host, () => {
    console.log(`Server running on port ${port}`);
  });
})();
