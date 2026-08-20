import { and, desc, eq, sql } from "drizzle-orm";
import { branches, internalAlerts } from "../drizzle/schema";
import { getDb } from "./db";

export type InternalAlertStatus = "missing" | "ordered" | "arrived" | "resolved";
export type InternalAlertPriority = "normal" | "important" | "urgent";
export type InternalAlertType = "part_shortage" | "important";

export type InternalAlertActor = {
  type: "owner" | "staff";
  staffId?: number | null;
  name: string;
};

export async function listInternalAlerts(input: {
  branchId?: number;
  archived?: boolean;
  deleted?: boolean;
  status?: InternalAlertStatus;
  alertType?: InternalAlertType;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(internalAlerts.deleted, input.deleted ?? false)];
  if (!input.deleted) conditions.push(eq(internalAlerts.archived, input.archived ?? false));
  if (input.branchId) conditions.push(eq(internalAlerts.branchId, input.branchId));
  if (input.status) conditions.push(eq(internalAlerts.status, input.status));
  if (input.alertType) conditions.push(eq(internalAlerts.alertType, input.alertType));

  const rows = await db
    .select({ alert: internalAlerts, branchName: branches.name })
    .from(internalAlerts)
    .leftJoin(branches, eq(internalAlerts.branchId, branches.id))
    .where(and(...conditions))
    .orderBy(
      sql`CASE ${internalAlerts.priority} WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END`,
      sql`CASE ${internalAlerts.status} WHEN 'missing' THEN 0 WHEN 'ordered' THEN 1 WHEN 'arrived' THEN 2 ELSE 3 END`,
      desc(internalAlerts.updatedAt),
    );
  return rows.map(row => ({ ...row.alert, branchName: row.branchName ?? "فرع غير معروف" }));
}

export async function getInternalAlertById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select({ alert: internalAlerts, branchName: branches.name })
    .from(internalAlerts)
    .leftJoin(branches, eq(internalAlerts.branchId, branches.id))
    .where(eq(internalAlerts.id, id))
    .limit(1);
  return row ? { ...row.alert, branchName: row.branchName ?? "فرع غير معروف" } : undefined;
}

export async function createInternalAlert(input: {
  branchId: number;
  alertType: InternalAlertType;
  title: string;
  partName?: string | null;
  quantity?: number | null;
  details?: string | null;
  priority: InternalAlertPriority;
  status?: InternalAlertStatus;
}, actor: InternalAlertActor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const result = await db.insert(internalAlerts).values({
    branchId: input.branchId,
    alertType: input.alertType,
    title: input.title.trim(),
    partName: input.partName?.trim() || null,
    quantity: input.quantity ?? null,
    details: input.details?.trim() || null,
    priority: input.priority,
    status: input.status ?? "missing",
    createdByType: actor.type,
    createdByStaffId: actor.staffId ?? null,
    createdByName: actor.name,
    updatedByType: actor.type,
    updatedByStaffId: actor.staffId ?? null,
    updatedByName: actor.name,
    resolvedAt: input.status === "resolved" ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  return getInternalAlertById(Number(result[0].insertId));
}

export async function updateInternalAlert(id: number, input: Partial<{
  alertType: InternalAlertType;
  title: string;
  partName: string | null;
  quantity: number | null;
  details: string | null;
  priority: InternalAlertPriority;
  status: InternalAlertStatus;
}>, actor: InternalAlertActor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const current = await getInternalAlertById(id);
  if (!current) return undefined;
  const now = Date.now();
  const normalized = {
    ...input,
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.partName !== undefined ? { partName: input.partName?.trim() || null } : {}),
    ...(input.details !== undefined ? { details: input.details?.trim() || null } : {}),
  };
  await db.update(internalAlerts).set({
    ...normalized,
    updatedByType: actor.type,
    updatedByStaffId: actor.staffId ?? null,
    updatedByName: actor.name,
    updatedAt: now,
    ...(input.status !== undefined
      ? { resolvedAt: input.status === "resolved" ? now : null }
      : {}),
  }).where(eq(internalAlerts.id, id));
  return getInternalAlertById(id);
}

export async function archiveInternalAlert(id: number, archived: boolean, actor: InternalAlertActor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const current = await getInternalAlertById(id);
  if (!current) return undefined;
  const now = Date.now();
  await db.update(internalAlerts).set({
    archived,
    archivedAt: archived ? now : null,
    updatedByType: actor.type,
    updatedByStaffId: actor.staffId ?? null,
    updatedByName: actor.name,
    updatedAt: now,
  }).where(eq(internalAlerts.id, id));
  return getInternalAlertById(id);
}

export async function softDeleteInternalAlert(id: number, deleted: boolean, actor: InternalAlertActor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const current = await getInternalAlertById(id);
  if (!current) return undefined;
  const now = Date.now();
  await db.update(internalAlerts).set({
    deleted,
    deletedAt: deleted ? now : null,
    deletedByName: deleted ? actor.name : null,
    archived: true,
    archivedAt: current.archivedAt ?? now,
    updatedByType: actor.type,
    updatedByStaffId: actor.staffId ?? null,
    updatedByName: actor.name,
    updatedAt: now,
  }).where(eq(internalAlerts.id, id));
  return getInternalAlertById(id);
}
