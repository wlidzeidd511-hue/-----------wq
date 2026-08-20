import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { asc, eq, lte } from "drizzle-orm";
import {
  additionalRepairProposals,
  auditLogs,
  backupSnapshots,
  branchContent,
  branchSettings,
  branches,
  customers,
  directMessages,
  notificationMessages,
  orderPhotos,
  orderStatusHistory,
  popupCategorySettings,
  popupMessages,
  scratchCampaigns,
  scratchCodes,
  scratchPrizes,
  serviceOrders,
  serviceRatings,
  shopSettings,
  smsMessages,
  staffAccounts,
  staffBranchAssignments,
  systemJobs,
  users,
  whatsappTemplates,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { writeAuditLog } from "./platformDb";
import { storageGetSignedUrl, storagePut } from "./storage";

const BACKUP_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
export const BACKUP_ENCRYPTION_VERSION = "aes-256-gcm-v1";

const BACKUP_TABLES = {
  users,
  branches,
  branch_settings: branchSettings,
  staff_accounts: staffAccounts,
  customers,
  service_orders: serviceOrders,
  order_status_history: orderStatusHistory,
  additional_repair_proposals: additionalRepairProposals,
  order_photos: orderPhotos,
  notification_messages: notificationMessages,
  shop_settings: shopSettings,
  sms_messages: smsMessages,
  staff_branch_assignments: staffBranchAssignments,
  popup_messages: popupMessages,
  popup_category_settings: popupCategorySettings,
  whatsapp_templates: whatsappTemplates,
  direct_messages: directMessages,
  scratch_campaigns: scratchCampaigns,
  scratch_prizes: scratchPrizes,
  scratch_codes: scratchCodes,
  service_ratings: serviceRatings,
  audit_logs: auditLogs,
  branch_content: branchContent,
  system_jobs: systemJobs,
} as const;

export type BackupPayload = {
  meta: { schemaVersion: 1; createdAt: string; rowCount: number; tableCount: number };
  tables: Record<string, unknown[]>;
};

type BackupEnvelope = {
  version: typeof BACKUP_ENCRYPTION_VERSION;
  compression: "gzip";
  iv: string;
  authTag: string;
  checksum: string;
  ciphertext: string;
};

function encryptionSecret(secret = ENV.cookieSecret) {
  if (!secret) throw new Error("JWT_SECRET is required for encrypted backups");
  return scryptSync(secret, "hattef-altamayuz-backup-v1", 32);
}

export function encryptBackupPayload(payload: BackupPayload, secret?: string) {
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const checksum = createHash("sha256").update(plaintext).digest("hex");
  const compressed = gzipSync(plaintext, { level: 9 });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionSecret(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const envelope: BackupEnvelope = {
    version: BACKUP_ENCRYPTION_VERSION,
    compression: "gzip",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    checksum,
    ciphertext: ciphertext.toString("base64"),
  };
  return { envelope: JSON.stringify(envelope), checksum };
}

export function decryptBackupEnvelope(raw: string, secret?: string) {
  const envelope = JSON.parse(raw) as BackupEnvelope;
  if (envelope.version !== BACKUP_ENCRYPTION_VERSION || envelope.compression !== "gzip") throw new Error("UNSUPPORTED_BACKUP_VERSION");
  const decipher = createDecipheriv("aes-256-gcm", encryptionSecret(secret), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const compressed = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
  const plaintext = gunzipSync(compressed);
  const actual = Buffer.from(createHash("sha256").update(plaintext).digest("hex"), "hex");
  const expected = Buffer.from(envelope.checksum, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("BACKUP_CHECKSUM_MISMATCH");
  return { payload: JSON.parse(plaintext.toString("utf8")) as BackupPayload, checksum: envelope.checksum };
}

export async function collectDatabaseBackup(createdAt = new Date()): Promise<BackupPayload> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const tables: Record<string, unknown[]> = {};
  let rowCount = 0;
  for (const [name, table] of Object.entries(BACKUP_TABLES)) {
    const rows = await db.select().from(table as any).orderBy(asc((table as any).id));
    tables[name] = rows;
    rowCount += rows.length;
  }
  return { meta: { schemaVersion: 1, createdAt: createdAt.toISOString(), rowCount, tableCount: Object.keys(tables).length }, tables };
}

function toSafeSnapshot<T extends typeof backupSnapshots.$inferSelect>(row: T) {
  const { storageKey: _storageKey, ...safe } = row;
  return safe;
}

export async function purgeExpiredBackupMetadata(now = Date.now()) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.delete(backupSnapshots).where(lte(backupSnapshots.expiresAt, now));
  return Number(result[0].affectedRows ?? 0);
}

export async function createDatabaseBackup(triggerType: "manual" | "scheduled", now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const backupKey = triggerType === "scheduled"
    ? `daily-${now.toISOString().slice(0, 10)}`
    : `manual-${now.toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
  const [existing] = await db.select().from(backupSnapshots).where(eq(backupSnapshots.backupKey, backupKey)).limit(1);
  if (existing?.status === "completed") return toSafeSnapshot(existing);
  const createdAt = now.getTime();
  const expiresAt = createdAt + BACKUP_RETENTION_MS;
  const result = await db.insert(backupSnapshots).values({
    backupKey,
    storageKey: `backups/pending/${backupKey}`,
    triggerType,
    status: "pending",
    createdAt,
    expiresAt,
  });
  const id = Number(result[0].insertId);
  try {
    const payload = await collectDatabaseBackup(now);
    const encrypted = encryptBackupPayload(payload);
    const stored = await storagePut(`backups/${now.toISOString().slice(0, 7)}/${backupKey}.json.enc`, encrypted.envelope, "application/json");
    await db.update(backupSnapshots).set({
      storageKey: stored.key,
      status: "completed",
      rowCount: payload.meta.rowCount,
      checksum: encrypted.checksum,
      failureReason: null,
    }).where(eq(backupSnapshots.id, id));
    await purgeExpiredBackupMetadata(createdAt);
    await writeAuditLog({ type: "system" }, "backup.completed", "backup_snapshot", id, { triggerType, rowCount: payload.meta.rowCount });
    const [snapshot] = await db.select().from(backupSnapshots).where(eq(backupSnapshots.id, id)).limit(1);
    return toSafeSnapshot(snapshot!);
  } catch (error) {
    await db.update(backupSnapshots).set({ status: "failed", failureReason: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000) }).where(eq(backupSnapshots.id, id));
    throw error;
  }
}

export async function listDatabaseBackups(limit = 30) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(backupSnapshots).orderBy(asc(backupSnapshots.createdAt)).limit(Math.min(100, Math.max(1, limit)));
  return rows.reverse().map(toSafeSnapshot);
}

export async function verifyDatabaseBackup(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [snapshot] = await db.select().from(backupSnapshots).where(eq(backupSnapshots.id, id)).limit(1);
  if (!snapshot || snapshot.status !== "completed") throw new Error("BACKUP_NOT_READY");
  const url = await storageGetSignedUrl(snapshot.storageKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`BACKUP_DOWNLOAD_FAILED_${response.status}`);
  const decrypted = decryptBackupEnvelope(await response.text());
  if (decrypted.checksum !== snapshot.checksum || decrypted.payload.meta.rowCount !== snapshot.rowCount) throw new Error("BACKUP_METADATA_MISMATCH");
  const verifiedAt = Date.now();
  await db.update(backupSnapshots).set({ verifiedAt }).where(eq(backupSnapshots.id, id));
  await writeAuditLog({ type: "owner" }, "backup.verified", "backup_snapshot", id, { rowCount: snapshot.rowCount });
  return { success: true as const, verifiedAt, rowCount: snapshot.rowCount, tableCount: decrypted.payload.meta.tableCount };
}
