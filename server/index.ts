import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { registerRoutes, registerHealthCheck } from "./routes";
import { db } from "./db";
import { migrateAccessCodesAtRest } from "./repositories/userRepo";

const app = express();

app.set("trust proxy", 1);

// Базовые заголовки безопасности (HSTS, анти-кликджекинг, nosniff, скрытие
// X-Powered-By). CSP отключаем намеренно — SPA грузит инлайновые стили/скрипты,
// и строгий CSP их сломал бы; остальные защиты включаем.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS-allowlist (defense-in-depth). Приложение same-origin — обычную работу
// это НЕ затрагивает (для same-origin браузер CORS не применяет). Allowlist
// лишь отсекает попытки чужих сайтов дёргать API из браузера с куками.
// Прод-домен задаётся через CORS_ORIGINS в .env (через запятую), а не в коде.
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGINS || "http://localhost:5000,http://localhost:5173")
    .split(",").map(s => s.trim()).filter(Boolean),
);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
  }
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

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

registerRoutes(app);

// Разовая идемпотентная миграция кодов доступа «в сейф» (когда задан секрет).
// Не блокирует старт и не валит сервер при ошибке — вход и так работает.
migrateAccessCodesAtRest(db)
  .then(n => { if (n) console.log(`[accessCode] зашифровано кодов при старте: ${n}`); })
  .catch(e => console.error("[accessCode] миграция при старте не удалась (вход работает):", (e as Error)?.message));

export { app };
