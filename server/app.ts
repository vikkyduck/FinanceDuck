import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { originPolicy } from "./originPolicy";
import { registerRoutes, registerHealthCheck } from "./routes";
import { db } from "./db";
import type { BackupService } from "./backupService";


/** Production and HTTP regressions use the same middleware and complete route registry. */
export function createApp(options: { database?: typeof db; backups?: BackupService; origins?: string } = {}) {
  const app = express();

  // X-Forwarded-For верим только nginx на этом же хосте; прямой клиент свой IP не подделает.
  app.set("trust proxy", "loopback");

  // Базовые заголовки безопасности (HSTS, анти-кликджекинг, nosniff, скрытие
  // X-Powered-By). CSP отключаем намеренно — SPA грузит инлайновые стили/скрипты,
  // и строгий CSP их сломал бы; остальные защиты включаем.
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS-allowlist (defense-in-depth). Приложение same-origin — обычную работу
  // это НЕ затрагивает (для same-origin браузер CORS не применяет). Allowlist
  // лишь отсекает попытки чужих сайтов дёргать API из браузера с куками.
  // Прод-домен задаётся через CORS_ORIGINS в .env (через запятую), а не в коде.
  const ALLOWED_ORIGINS = new Set(
    (options.origins ?? process.env.CORS_ORIGINS ?? "http://localhost:5000,http://localhost:5173")
      .split(",").map(s => s.trim()).filter(Boolean),
  );
  app.use("/api", originPolicy(ALLOWED_ORIGINS));

  // Лимит тела запроса. Базово скромный (анти-DoS), большой — ТОЛЬКО для загрузки
  // актов (base64-файлы, единственный крупный роут). Раньше 20mb висел на ВСЁМ.
  const bigJson = express.json({ limit: "20mb" });
  const smallJson = express.json({ limit: "2mb" });
  app.use((req, res, next) => {
    if (req.method === "POST" && /^\/api\/invoices\/[^/]+\/acts$/.test(req.path)) {
      return bigJson(req, res, next);
    }
    return smallJson(req, res, next);
  });
  app.use(cookieParser());

  registerHealthCheck(app);

  registerRoutes(app, options.database, options.backups);

  return app;
}
