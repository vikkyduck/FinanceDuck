/**
 * Express middleware for authentication and role-based access control.
 * Extracted from routes.ts for single-responsibility.
 */

import { Request, Response, NextFunction } from "express";
import type { AuthStore } from "./routeStores";
import { AccessToken, UserRole } from "../shared/schema";

export const SESSION_COOKIE = "session_id";

export interface AuthenticatedRequest extends Request<Record<string, string>> {
  user?: {
    token: AccessToken;
    role: UserRole;
    partnerId?: string;
    clientId?: string;
  };
}

/**
 * Validates the session cookie and attaches `req.user`.
 * Also validates CSRF token for mutating methods (POST / PUT / PATCH / DELETE).
 */
export function createAuthMiddleware(storage: Pick<AuthStore, "validateSession">) {
return async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const sessionId = req.cookies?.[SESSION_COOKIE];

  if (!sessionId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const csrfToken   = req.headers["x-csrf-token"];
  const isModifying = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);

  const result = await storage.validateSession(sessionId);

  if (!result?.isValid || !result.token) {
    res.clearCookie(SESSION_COOKIE);
    return res.status(401).json({ error: "Session expired" });
  }

  if (isModifying && (typeof csrfToken !== "string" || !csrfToken || csrfToken !== result.csrfToken)) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  req.user = {
    token:     result.token,
    role:      result.token.role,
    partnerId: result.token.partnerId || undefined,
    clientId:  result.token.clientId  || undefined,
  };

  next();
}

}
export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;

/**
 * Guards a route to roles on the allowlist.
 * Returns 403 if the authenticated user's role is not included.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
