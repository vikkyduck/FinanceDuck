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

app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

registerHealthCheck(app);

registerRoutes(app);

// Разовая идемпотентная миграция кодов доступа «в сейф» (когда задан секрет).
// Не блокирует старт и не валит сервер при ошибке — вход и так работает.
migrateAccessCodesAtRest(db)
  .then(n => { if (n) console.log(`[accessCode] зашифровано кодов при старте: ${n}`); })
  .catch(e => console.error("[accessCode] миграция при старте не удалась (вход работает):", (e as Error)?.message));

export { app };
