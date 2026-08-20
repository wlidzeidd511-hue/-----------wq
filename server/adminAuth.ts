import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { promisify } from "node:util";
import { ENV } from "./_core/env";

const scryptAsync = promisify(scrypt);

export const OWNER_SESSION_COOKIE = "hattef_owner_session";
export const OWNER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type OwnerSessionPayload = {
  kind: "owner";
  sessionVersion: number;
};

function getSigningKey() {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is required for owner sessions");
  }

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

export async function hashOwnerPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return { hash: derivedKey.toString("hex"), salt };
}

export async function verifyOwnerPassword(password: string, hash: string, salt: string) {
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(hash, "hex");
  return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
}

export async function createOwnerSessionToken(sessionVersion: number) {
  return new SignJWT({ kind: "owner", sessionVersion } satisfies OwnerSessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSigningKey());
}

export async function readOwnerSession(req: Request): Promise<OwnerSessionPayload | null> {
  const token = readCookie(req, OWNER_SESSION_COOKIE);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSigningKey());
    if (payload.kind !== "owner" || typeof payload.sessionVersion !== "number") return null;
    return { kind: "owner", sessionVersion: payload.sessionVersion };
  } catch {
    return null;
  }
}
