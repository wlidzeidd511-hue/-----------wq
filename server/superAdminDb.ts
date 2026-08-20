import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { AuthenticatorTransportFuture, WebAuthnCredential } from "@simplewebauthn/server";
import { ownerPasskeys, ownerSecuritySettings } from "../drizzle/schema";
import { getDb } from "./db";

export function hashEnrollmentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashCredentialId(credentialId: string) {
  return createHash("sha256").update(credentialId).digest("hex");
}

function secureHashEquals(left: string | null | undefined, right: string) {
  if (!left || left.length !== right.length) return false;
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function ensureOwnerSecuritySettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(ownerSecuritySettings)
    .values({ id: 1 })
    .onDuplicateKeyUpdate({ set: { id: 1 } });
  const [settings] = await db.select().from(ownerSecuritySettings).where(eq(ownerSecuritySettings.id, 1)).limit(1);
  if (!settings) throw new Error("Owner security settings unavailable");
  return settings;
}

export async function listActiveOwnerPasskeys() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(ownerPasskeys).where(isNull(ownerPasskeys.revokedAt)).orderBy(ownerPasskeys.createdAt);
}

export async function ownerPasskeyStatus() {
  const passkeys = await listActiveOwnerPasskeys();
  return { configured: passkeys.length > 0 };
}

export async function validateOwnerEnrollmentToken(token: string) {
  const settings = await ensureOwnerSecuritySettings();
  const tokenHash = hashEnrollmentToken(token);
  const valid = secureHashEquals(settings.enrollmentTokenHash, tokenHash) && Boolean(settings.enrollmentExpiresAt && settings.enrollmentExpiresAt > Date.now());
  return valid ? { settings, tokenHash } : null;
}

type SaveOwnerPasskeyInput = {
  credentialId: string;
  publicKey: Uint8Array;
  webauthnUserId: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports?: AuthenticatorTransportFuture[];
  enrollmentTokenHash: string;
  displayName?: string;
};

export async function consumeEnrollmentAndSaveOwnerPasskey(input: SaveOwnerPasskeyInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const credentialIdHash = hashCredentialId(input.credentialId);
  await db.transaction(async tx => {
    const [settings] = await tx.select().from(ownerSecuritySettings).where(eq(ownerSecuritySettings.id, 1)).limit(1);
    if (
      !settings ||
      !secureHashEquals(settings.enrollmentTokenHash, input.enrollmentTokenHash) ||
      !settings.enrollmentExpiresAt ||
      settings.enrollmentExpiresAt <= now
    ) throw new Error("OWNER_ENROLLMENT_TOKEN_EXPIRED");

    await tx.insert(ownerPasskeys).values({
      credentialIdHash,
      credentialId: input.credentialId,
      publicKey: Buffer.from(input.publicKey).toString("base64url"),
      webauthnUserId: input.webauthnUserId,
      counter: input.counter,
      deviceType: input.deviceType,
      backedUp: input.backedUp,
      transports: input.transports?.length ? JSON.stringify(input.transports) : null,
      displayName: input.displayName?.trim().slice(0, 160) || "جهاز المالك",
      createdAt: now,
    });
    await tx
      .update(ownerSecuritySettings)
      .set({ enrollmentTokenHash: null, enrollmentExpiresAt: null })
      .where(eq(ownerSecuritySettings.id, 1));
  });
  return { credentialIdHash };
}

export async function findActiveOwnerPasskey(credentialId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const credentialIdHash = hashCredentialId(credentialId);
  const [passkey] = await db
    .select()
    .from(ownerPasskeys)
    .where(and(eq(ownerPasskeys.credentialIdHash, credentialIdHash), isNull(ownerPasskeys.revokedAt)))
    .limit(1);
  return passkey;
}

export function ownerPasskeyToCredential(passkey: Awaited<ReturnType<typeof findActiveOwnerPasskey>>): WebAuthnCredential {
  if (!passkey) throw new Error("OWNER_PASSKEY_NOT_FOUND");
  let transports: AuthenticatorTransportFuture[] | undefined;
  try {
    transports = passkey.transports ? JSON.parse(passkey.transports) as AuthenticatorTransportFuture[] : undefined;
  } catch {
    transports = undefined;
  }
  return {
    id: passkey.credentialId,
    publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
    counter: passkey.counter,
    transports,
  };
}

export async function recordOwnerPasskeyUse(passkeyId: number, counter: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(ownerPasskeys)
    .set({ counter, lastUsedAt: Date.now() })
    .where(and(eq(ownerPasskeys.id, passkeyId), isNull(ownerPasskeys.revokedAt)));
}
