import type { RequestHandler } from "express";

/** Reject cross-site writes, including login CSRF, before parsing their body. */
export function originPolicy(allowedOrigins: Set<string>): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    const sameOrigin = `${req.protocol}://${req.get("host")}`;
    const allowed = !origin || origin === sameOrigin || allowedOrigins.has(origin);
    if (!allowed || (!origin && req.headers["sec-fetch-site"] === "cross-site")) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    res.vary("Origin");
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, Idempotency-Key");
    }
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    next();
  };
}
