import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

export const BRANCH_SESSION_COOKIE = "hattef_branch_access";
export const BRANCH_SESSION_TTL_MS = 30 * 60 * 1000;

export type BranchSessionPayload = {
  kind: "owner_branch";
  branchId: number;
  sessionVersion: number;
};

function signingKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for branch sessions");
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

export async function createBranchSessionToken(branchId: number, sessionVersion: number) {
  return new SignJWT({ kind: "owner_branch", branchId, sessionVersion } satisfies BranchSessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(signingKey());
}

export async function readBranchSession(req: Request): Promise<BranchSessionPayload | null> {
  const token = readCookie(req, BRANCH_SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey());
    if (payload.kind !== "owner_branch" || typeof payload.branchId !== "number" || typeof payload.sessionVersion !== "number") return null;
    return { kind: "owner_branch", branchId: payload.branchId, sessionVersion: payload.sessionVersion };
  } catch {
    return null;
  }
}
