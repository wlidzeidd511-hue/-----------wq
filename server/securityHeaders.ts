import type { NextFunction, Request, Response } from "express";

export function buildSecurityHeaders(isDevelopment: boolean, isSecure: boolean) {
  const scriptPolicy = isDevelopment ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
  const connectPolicy = isDevelopment ? "'self' https: wss: ws:" : "'self' https: wss:";
  const contentSecurityPolicy = [
      "default-src 'self'",
      `script-src ${scriptPolicy}`,
      "script-src-attr 'none'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      `connect-src ${connectPolicy}`,
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      ...(isSecure && !isDevelopment ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
  return {
    "Content-Security-Policy": contentSecurityPolicy,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-DNS-Prefetch-Control": "off",
    "X-Download-Options": "noopen",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Origin-Agent-Cluster": "?1",
    ...(isSecure ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" } : {}),
  };
}

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim().toLowerCase();
  const isSecure = req.protocol === "https" || forwardedProto === "https";
  const headers = buildSecurityHeaders(process.env.NODE_ENV === "development", isSecure);
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  next();
}
