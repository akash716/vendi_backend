import { verifyToken } from "../services/auth.js";

/* ── Admin JWT guard ── */
export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized — no token" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized — invalid or expired token" });
  if (payload.role !== "ADMIN") return res.status(403).json({ error: "Forbidden — admin only" });
  req.admin = payload;
  next();
}

/* ── Manual rate limiter (no external deps) ── */
const _store = new Map();
export function rateLimit({ windowMs = 60000, max = 10, message = "Too many requests, try later" } = {}) {
  return (req, res, next) => {
    const key = (req.ip || "x") + req.path;
    const now = Date.now();
    const hits = (_store.get(key) || []).filter(t => now - t < windowMs);
    hits.push(now);
    _store.set(key, hits);
    if (hits.length > max) return res.status(429).json({ error: message });
    next();
  };
}
