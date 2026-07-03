import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { registerRoutes, registerHealthCheck } from "./routes";

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

export { app };
