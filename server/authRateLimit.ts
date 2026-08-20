import { createHmac } from "node:crypto";
import type { Request } from "express";
import { and, eq, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { authLoginAttempts } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";

export type LoginScope = "owner" | "staff" | "customer";

const WINDOW_MS = 15 * 60 * 1_000;
const BLOCK_MS = 15 * 60 * 1_000;
const MAX_FAILURES = 5;

function signingSecret() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for login protection");
  return ENV.cookieSecret;
}

function hashValue(scope: LoginScope, keyType: "identity" | "network", value: string) {
  return createHmac("sha256", signingSecret())
    .update(`${scope}:${keyType}:${value}`)
    .digest("hex");
}

function requestNetworkFingerprint(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  const address = forwardedValue?.trim() || req.socket?.remoteAddress || "unknown";
  const userAgent = String(req.headers["user-agent"] ?? "unknown").slice(0, 240);
  return `${address}|${userAgent}`;
}

function attemptKeys(req: Request, scope: LoginScope, identifier: string) {
  const normalized = identifier.trim().toLowerCase() || "unknown";
  return [
    { keyType: "identity" as const, keyHash: hashValue(scope, "identity", normalized) },
    { keyType: "network" as const, keyHash: hashValue(scope, "network", requestNetworkFingerprint(req)) },
  ];
}

async function findAttempt(scope: LoginScope, keyType: "identity" | "network", keyHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [attempt] = await db
    .select()
    .from(authLoginAttempts)
    .where(and(eq(authLoginAttempts.scope, scope), eq(authLoginAttempts.keyType, keyType), eq(authLoginAttempts.keyHash, keyHash)))
    .limit(1);
  return attempt;
}

export async function assertLoginAllowed(req: Request, scope: LoginScope, identifier: string) {
  const now = Date.now();
  for (const key of attemptKeys(req, scope, identifier)) {
    const attempt = await findAttempt(scope, key.keyType, key.keyHash);
    if (attempt?.blockedUntil && attempt.blockedUntil > now) {
      const minutes = Math.max(1, Math.ceil((attempt.blockedUntil - now) / 60_000));
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `محاولات كثيرة. أعد المحاولة بعد ${minutes} دقيقة.` });
    }
  }
}

async function recordFailureForKey(scope: LoginScope, keyType: "identity" | "network", keyHash: string, now: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await findAttempt(scope, keyType, keyHash);
  if (!existing) {
    await db.insert(authLoginAttempts).values({ scope, keyType, keyHash, failedCount: 1, windowStartedAt: now, lastAttemptAt: now });
    return;
  }
  const resetWindow = now - existing.windowStartedAt >= WINDOW_MS;
  const failedCount = resetWindow ? 1 : existing.failedCount + 1;
  await db
    .update(authLoginAttempts)
    .set({
      failedCount,
      windowStartedAt: resetWindow ? now : existing.windowStartedAt,
      lastAttemptAt: now,
      blockedUntil: failedCount >= MAX_FAILURES ? now + BLOCK_MS : null,
    })
    .where(eq(authLoginAttempts.id, existing.id));
}

export async function recordLoginFailure(req: Request, scope: LoginScope, identifier: string) {
  const now = Date.now();
  for (const key of attemptKeys(req, scope, identifier)) {
    await recordFailureForKey(scope, key.keyType, key.keyHash, now);
  }
}

export async function recordLoginSuccess(req: Request, scope: LoginScope, identifier: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const key of attemptKeys(req, scope, identifier)) {
    await db
      .delete(authLoginAttempts)
      .where(and(eq(authLoginAttempts.scope, scope), eq(authLoginAttempts.keyType, key.keyType), eq(authLoginAttempts.keyHash, key.keyHash)));
  }
}

export async function purgeExpiredLoginAttempts() {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = Date.now() - 24 * 60 * 60 * 1_000;
  const result = await db.delete(authLoginAttempts).where(lt(authLoginAttempts.lastAttemptAt, cutoff));
  return Number(result[0].affectedRows ?? 0);
}
