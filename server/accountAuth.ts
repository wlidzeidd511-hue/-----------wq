import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import { ENV } from "./_core/env";

export const PORTAL_SESSION_COOKIE = "hattef_portal_session";
export const STAFF_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type PortalSessionPayload =
  | {
      kind: "staff";
      accountId: number;
      branchId: number;
      sessionVersion: number;
    }
  | {
      kind: "customer";
      accountId: number;
      sessionVersion: number;
    };

function getSigningKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for portal sessions");
  return new TextEncoder().encode(ENV.cookieSecret);
}

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

export async function createPortalSessionToken(payload: PortalSessionPayload) {
  const expiresIn = payload.kind === "staff" ? "12h" : "30d";
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSigningKey());
}

export async function readPortalSession(req: Request): Promise<PortalSessionPayload | null> {
  const token = readCookie(req, PORTAL_SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSigningKey());
    if (payload.kind === "staff") {
      if (
        typeof payload.accountId !== "number" ||
        typeof payload.branchId !== "number" ||
        typeof payload.sessionVersion !== "number"
      ) return null;
      return {
        kind: "staff",
        accountId: payload.accountId,
        branchId: payload.branchId,
        sessionVersion: payload.sessionVersion,
      };
    }
    if (payload.kind === "customer") {
      if (typeof payload.accountId !== "number" || typeof payload.sessionVersion !== "number") return null;
      return {
        kind: "customer",
        accountId: payload.accountId,
        sessionVersion: payload.sessionVersion,
      };
    }
    return null;
  } catch {
    return null;
  }
}
