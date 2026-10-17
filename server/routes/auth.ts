import type { AuthMiddleware } from "../middleware";
import { Router, Request, Response } from "express";
import type { AuthStore } from "../routeStores";
import {
  SESSION_COOKIE,
  AuthenticatedRequest,
  requireRole,
} from "../middleware";
import type { LoginAttemptLimiter } from '../rateLimiter';

export function createAuthRouter(storage: AuthStore, authMiddleware: AuthMiddleware, limiter: LoginAttemptLimiter) {
const { reserveLoginAttempt, reserveIpAttempt, clearLoginAttempts, clearAllLoginAttempts, getLockedCodes } = limiter;
const authRouter = Router();

/**
 * Опции session-cookie. В production ЖЁСТКО secure:true — не полагаемся на
 * то, что прокси проставит x-forwarded-proto (иначе кука могла бы уйти без
 * Secure). SameSite=Lax дополняет обязательную проверку CSRF.
 */
function sessionCookieOptions(req: Request) {
  const isProd    = process.env.NODE_ENV === "production";
  const isProxied = req.headers["x-forwarded-proto"] === "https";
  const secure    = isProd || isProxied || req.secure;
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: 30 * 60 * 1000,
    path: "/",
  };
}

authRouter.post("/api/admin/unlock-user", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (typeof code !== "string" || !code || code.length > 128) return res.status(400).json({ error: "Code is required" });
    const cleared = await clearLoginAttempts(code);
    res.json({
      success: true,
      message: cleared ? `Unlocked code: ${code.toUpperCase()}` : `Code ${code.toUpperCase()} was not locked`,
    });
  } catch (error) {
    console.error("Unlock user error:", error);
    res.status(500).json({ error: "Failed to unlock user" });
  }
});

authRouter.get("/api/admin/locked-codes", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const locked = await getLockedCodes();
    res.json({ locked, count: locked.length });
  } catch (error) {
    console.error("Get locked codes error:", error);
    res.status(500).json({ error: "Failed to get locked codes" });
  }
});

authRouter.post("/api/admin/clear-all-lockouts", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const count = await clearAllLoginAttempts();
    res.json({ success: true, message: `Cleared ${count} login attempt records` });
  } catch (error) {
    console.error("Clear all lockouts error:", error);
    res.status(500).json({ error: "Failed to clear lockouts" });
  }
});

authRouter.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const rawCode = req.body?.code;
    if (typeof rawCode !== "string" || !rawCode.trim() || rawCode.length > 128) {
      return res.status(400).json({ success: false, error: "missing_code", message: "Код доступа обязателен" });
    }
    const code = rawCode.trim().toUpperCase();
    const ip = req.ip || "unknown";

    // Блокировка по IP: ловит перебор МНОГИХ кодов с одного адреса (per-code
    // лимита для этого мало — каждый новый код обнуляет счётчик).
    const ipStatus = await reserveIpAttempt(ip);
    if (!ipStatus.allowed) {
      return res.status(429).json({
        success: false,
        error: "account_locked",
        message: "Слишком много попыток с этого адреса. Попробуйте позже.",
        locked_until: new Date(ipStatus.lockedUntil!).toISOString(),
        attempts_remaining: 0,
      });
    }

    const attemptStatus = await reserveLoginAttempt(code);
    if (!attemptStatus.allowed) {
      return res.status(429).json({
        success: false,
        error: "account_locked",
        message: "Слишком много неудачных попыток. Попробуйте позже.",
        locked_until: new Date(attemptStatus.lockedUntil!).toISOString(),
        attempts_remaining: 0,
      });
    }
    const token = await storage.verifyAccessCode(code);
    if (!token) {
      const result = attemptStatus;
      return res.status(401).json({
        success: false,
        error: "invalid_code",
        message: "Неверный код доступа",
        attempts_remaining: result.attemptsRemaining,
        locked_until: result.lockedUntil ? new Date(result.lockedUntil).toISOString() : undefined,
      });
    }
    // На успехе чистим счётчик кода; IP-счётчик не трогаем (анти-спрей окно
    // само истечёт, легитимный юзер редко копит десятки фейлов).
    await clearLoginAttempts(code);
    const session = await storage.createSession(token.id, req.ip, req.headers["user-agent"]);
    res.cookie(SESSION_COOKIE, session.sessionId, sessionCookieOptions(req));
    res.json({ success: true, csrfToken: session.csrfToken, user: { role: token.role, partnerId: token.partnerId, clientId: token.clientId } });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: "server_error", message: "Ошибка сервера при входе" });
  }
});

authRouter.post("/api/auth/logout", authMiddleware, async (req: Request, res: Response) => {
  const sessionId = req.cookies[SESSION_COOKIE];
  if (sessionId) await storage.revokeSession(sessionId);
  res.clearCookie(SESSION_COOKIE);
  res.json({ success: true });
});

authRouter.get("/api/auth/validate", async (req: Request, res: Response) => {
  const sessionId = req.cookies[SESSION_COOKIE];
  if (!sessionId) return res.json({ valid: false });
  const result = await storage.validateSession(sessionId);
  if (!result?.isValid || !result.token) {
    res.clearCookie(SESSION_COOKIE);
    return res.json({ valid: false });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ valid: true, csrfToken: result.csrfToken, user: { role: result.token.role, partnerId: result.token.partnerId, clientId: result.token.clientId } });
});

authRouter.post("/api/auth/refresh", authMiddleware, async (req: Request, res: Response) => {
  const sessionId = req.cookies[SESSION_COOKIE];
  if (!sessionId) return res.status(401).json({ error: "Not authenticated" });
  const newExpiresAt = await storage.refreshSession(sessionId);
  if (!newExpiresAt) {
    res.clearCookie(SESSION_COOKIE);
    return res.status(401).json({ error: "Session expired" });
  }
  res.cookie(SESSION_COOKIE, sessionId, sessionCookieOptions(req));
  res.json({ success: true, expiresAt: newExpiresAt });
});

return authRouter;
}
