import { and, asc, eq } from "drizzle-orm";
import { branchSettings, branches } from "../drizzle/schema";
import { hashOwnerPassword, verifyOwnerPassword } from "./adminAuth";
import { getDb } from "./db";
import { writeAuditLog } from "./platformDb";

export async function listBranchProtectionStates() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: branches.id,
      name: branches.name,
      code: branches.code,
      slug: branches.slug,
      isActive: branches.isActive,
      sortOrder: branches.sortOrder,
      adminPasswordHash: branchSettings.adminPasswordHash,
    })
    .from(branches)
    .leftJoin(branchSettings, eq(branchSettings.branchId, branches.id))
    .where(eq(branches.isActive, true))
    .orderBy(asc(branches.sortOrder), asc(branches.id));
  return rows.map(({ adminPasswordHash, ...branch }) => ({ ...branch, protectionConfigured: Boolean(adminPasswordHash) }));
}

export async function getBranchProtection(branchId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select({
      id: branches.id,
      name: branches.name,
      isActive: branches.isActive,
      adminPasswordHash: branchSettings.adminPasswordHash,
      adminPasswordSalt: branchSettings.adminPasswordSalt,
      sessionVersion: branchSettings.sessionVersion,
    })
    .from(branches)
    .leftJoin(branchSettings, eq(branchSettings.branchId, branches.id))
    .where(and(eq(branches.id, branchId), eq(branches.isActive, true)))
    .limit(1);
  return row;
}

export async function initializeBranchProtection(branchId: number, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const branch = await getBranchProtection(branchId);
  if (!branch) return undefined;
  if (branch.adminPasswordHash && branch.adminPasswordSalt) return null;
  const credentials = await hashOwnerPassword(password);
  const sessionVersion = (branch.sessionVersion ?? 1) + 1;
  await db
    .insert(branchSettings)
    .values({ branchId, adminPasswordHash: credentials.hash, adminPasswordSalt: credentials.salt, sessionVersion })
    .onDuplicateKeyUpdate({ set: { adminPasswordHash: credentials.hash, adminPasswordSalt: credentials.salt, sessionVersion } });
  await writeAuditLog({ type: "owner", branchId }, "branch.protection.initialized", "branch", branchId);
  return { branchId, branchName: branch.name, sessionVersion };
}

export async function authenticateBranchProtection(branchId: number, password: string) {
  const branch = await getBranchProtection(branchId);
  if (!branch || !branch.adminPasswordHash || !branch.adminPasswordSalt) return undefined;
  const valid = await verifyOwnerPassword(password, branch.adminPasswordHash, branch.adminPasswordSalt);
  if (!valid) return null;
  return { branchId, branchName: branch.name, sessionVersion: branch.sessionVersion ?? 1 };
}

export async function changeBranchProtection(branchId: number, currentPassword: string, newPassword: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const branch = await getBranchProtection(branchId);
  if (!branch) return { status: "not_found" as const };
  if (!branch.adminPasswordHash || !branch.adminPasswordSalt) return { status: "not_configured" as const };
  const valid = await verifyOwnerPassword(currentPassword, branch.adminPasswordHash, branch.adminPasswordSalt);
  if (!valid) return { status: "invalid_password" as const };
  const credentials = await hashOwnerPassword(newPassword);
  const sessionVersion = (branch.sessionVersion ?? 1) + 1;
  await db
    .update(branchSettings)
    .set({ adminPasswordHash: credentials.hash, adminPasswordSalt: credentials.salt, sessionVersion })
    .where(eq(branchSettings.branchId, branchId));
  await writeAuditLog({ type: "owner", branchId }, "branch.protection.changed", "branch", branchId);
  return { status: "changed" as const, branch: { branchId, branchName: branch.name, sessionVersion } };
}

export async function validateBranchSession(branchId: number, sessionVersion: number) {
  const branch = await getBranchProtection(branchId);
  if (!branch) return undefined;
  if ((branch.sessionVersion ?? 1) !== sessionVersion) return undefined;
  return { branchId, branchName: branch.name, sessionVersion: branch.sessionVersion ?? 1 };
}
