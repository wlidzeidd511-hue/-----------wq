import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

export const SUPER_ADMIN_SESSION_COOKIE = "hattef_super_admin_session";
export const SUPER_ADMIN_CHALLENGE_COOKIE = "hattef_super_admin_challenge";
export const SUPER_ADMIN_SESSION_TTL_MS = 20 * 60 * 1000;
export const SUPER_ADMIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type SuperAdminSessionPayload = {
  kind: "super_admin";
  sessionVersion: number;
  credentialIdHash: string;
};

export type SuperAdminChallengePayload = {
  kind: "super_admin_challenge";
  flow: "registration" | "authentication";
  challenge: string;
  enrollmentTokenHash?: string;
  webauthnUserId?: string;
};

function signingKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for super admin sessions");
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

export async function createSuperAdminSessionToken(sessionVersion: number, credentialIdHash: string) {
  return new SignJWT({ kind: "super_admin", sessionVersion, credentialIdHash } satisfies SuperAdminSessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(signingKey());
}

export async function readSuperAdminSession(req: Request): Promise<SuperAdminSessionPayload | null> {
  const token = readCookie(req, SUPER_ADMIN_SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey());
    if (
      payload.kind !== "super_admin" ||
      typeof payload.sessionVersion !== "number" ||
      typeof payload.credentialIdHash !== "string"
    ) return null;
    return {
      kind: "super_admin",
      sessionVersion: payload.sessionVersion,
      credentialIdHash: payload.credentialIdHash,
    };
  } catch {
    return null;
  }
}

export async function createSuperAdminChallengeToken(payload: Omit<SuperAdminChallengePayload, "kind">) {
  return new SignJWT({ kind: "super_admin_challenge", ...payload } satisfies SuperAdminChallengePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signingKey());
}

export async function readSuperAdminChallenge(req: Request): Promise<SuperAdminChallengePayload | null> {
  const token = readCookie(req, SUPER_ADMIN_CHALLENGE_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey());
    if (
      payload.kind !== "super_admin_challenge" ||
      (payload.flow !== "registration" && payload.flow !== "authentication") ||
      typeof payload.challenge !== "string"
    ) return null;
    return {
      kind: "super_admin_challenge",
      flow: payload.flow,
      challenge: payload.challenge,
      enrollmentTokenHash: typeof payload.enrollmentTokenHash === "string" ? payload.enrollmentTokenHash : undefined,
      webauthnUserId: typeof payload.webauthnUserId === "string" ? payload.webauthnUserId : undefined,
    };
  } catch {
    return null;
  }
}
