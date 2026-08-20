import type { NextFunction, Request, Response } from "express";

type RateBucket = { count: number; resetAt: number };
const buckets = new Map<string, RateBucket>();
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

function networkKey(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  const firstForwarded = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim();
  return firstForwarded || req.socket.remoteAddress || "unknown";
}

function requestGroup(req: Request) {
  const path = req.originalUrl.toLowerCase();
  if (path.includes("uploadphoto")) return { name: "upload", max: 24 };
  if (path.includes("engagement.send") || path.includes("sendtoorder") || path.includes("proposals.owner.create")) return { name: "message", max: 60 };
  if (req.method !== "GET" && req.method !== "HEAD") return { name: "write", max: 180 };
  return { name: "read", max: 360 };
}

function pruneBuckets(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of Array.from(buckets.entries())) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size >= MAX_BUCKETS) {
    const overflow = buckets.size - MAX_BUCKETS + 1;
    for (const key of Array.from(buckets.keys()).slice(0, overflow)) buckets.delete(key);
  }
}

export function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  pruneBuckets(now);
  const group = requestGroup(req);
  const key = `${networkKey(req)}:${group.name}`;
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now ? { count: 1, resetAt: now + WINDOW_MS } : { ...existing, count: existing.count + 1 };
  buckets.set(key, bucket);
  res.setHeader("X-RateLimit-Limit", String(group.max));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, group.max - bucket.count)));
  if (bucket.count > group.max) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    res.status(429).json({ error: "طلبات كثيرة، انتظر قليلًا ثم حاول مرة أخرى" });
    return;
  }
  next();
}

function expectedHosts(req: Request) {
  const values = [req.headers.host, req.headers["x-forwarded-host"]]
    .flatMap(value => Array.isArray(value) ? value : String(value ?? "").split(","))
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(values);
}

export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const fetchSite = String(req.headers["sec-fetch-site"] ?? "").toLowerCase();
  if (fetchSite === "cross-site") {
    res.status(403).json({ error: "تم رفض طلب من موقع خارجي" });
    return;
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (!expectedHosts(req).has(originHost)) {
        res.status(403).json({ error: "مصدر الطلب غير مسموح" });
        return;
      }
    } catch {
      res.status(403).json({ error: "مصدر الطلب غير صالح" });
      return;
    }
  }
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (req.method === "POST" && !contentType.startsWith("application/json")) {
    res.status(415).json({ error: "نوع محتوى الطلب غير مدعوم" });
    return;
  }
  next();
}

export function resetRequestSecurityForTests() {
  buckets.clear();
}
