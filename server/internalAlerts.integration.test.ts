import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLogs, internalAlerts, staffAccounts, staffBranchAssignments } from "../drizzle/schema";
import type { PortalSessionPayload } from "./accountAuth";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

const createdAlertIds: number[] = [];
const createdStaffIds: number[] = [];

async function context(input: { owner?: boolean; ownerBranchId?: number; portalSession?: PortalSessionPayload | null } = {}): Promise<TrpcContext> {
  const settings = await getShopSettings();
  return {
    user: null,
    ownerSession: input.owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: input.owner ? await currentBranchSession(input.ownerBranchId ?? 1) : null,
    portalSession: input.portalSession ?? null,
    req: {
      protocol: "https",
      headers: { "user-agent": "vitest-internal-alerts", "x-forwarded-for": "127.0.0.77" },
      socket: { remoteAddress: "127.0.0.77" },
    } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  for (const id of createdAlertIds.splice(0).reverse()) {
    await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "internal_alert"), eq(auditLogs.entityId, String(id))));
    await db.delete(internalAlerts).where(eq(internalAlerts.id, id));
  }
  for (const id of createdStaffIds.splice(0).reverse()) {
    await db.delete(staffBranchAssignments).where(eq(staffBranchAssignments.staffId, id));
    await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "staff"), eq(auditLogs.entityId, String(id))));
    await db.delete(staffAccounts).where(eq(staffAccounts.id, id));
  }
});

describe("internal alerts, branch isolation, and permissions", () => {
  it("isolates alerts by branch and enforces create, update, archive, and public denial", async () => {
    const owner = appRouter.createCaller(await context({ owner: true, ownerBranchId: 1 }));
    const otherOwner = appRouter.createCaller(await context({ owner: true, ownerBranchId: 2 }));
    const visitor = appRouter.createCaller(await context());
    const suffix = `${Date.now()}-${randomUUID().slice(0, 6)}`;
    const full = await owner.accounts.staff.create({
      branchId: 1,
      name: "مسؤول تنبيهات البصيرية",
      username: `alerts-full-${suffix}`,
      permissions: ["orders.view_branch", "alerts.view", "alerts.create", "alerts.update", "alerts.delete"],
    });
    const viewOnly = await owner.accounts.staff.create({
      branchId: 1,
      name: "مشاهد تنبيهات فقط",
      username: `alerts-view-${suffix}`,
      permissions: ["orders.view_branch", "alerts.view"],
    });
    const otherBranch = await otherOwner.accounts.staff.create({
      branchId: 2,
      name: "مسؤول تنبيهات البساتين",
      username: `alerts-other-${suffix}`,
      permissions: ["orders.view_branch", "alerts.view", "alerts.update"],
    });
    if (!full.staff || !viewOnly.staff || !otherBranch.staff) throw new Error("Staff setup failed");
    createdStaffIds.push(full.staff.id, viewOnly.staff.id, otherBranch.staff.id);

    const fullCaller = appRouter.createCaller(await context({ portalSession: { kind: "staff", accountId: full.staff.id, branchId: 1, sessionVersion: full.staff.sessionVersion } }));
    const viewCaller = appRouter.createCaller(await context({ portalSession: { kind: "staff", accountId: viewOnly.staff.id, branchId: 1, sessionVersion: viewOnly.staff.sessionVersion } }));
    const otherCaller = appRouter.createCaller(await context({ portalSession: { kind: "staff", accountId: otherBranch.staff.id, branchId: 2, sessionVersion: otherBranch.staff.sessionVersion } }));

    const branchOne = await owner.internalAlerts.owner.create({ branchId: 1, alertType: "part_shortage", title: "ناقص شاشة اختبار", partName: "شاشة اختبار", quantity: 2, details: "لون أسود", priority: "urgent", status: "missing" });
    const branchTwo = await otherOwner.internalAlerts.owner.create({ branchId: 2, alertType: "important", title: "تنبيه فرع آخر", partName: null, quantity: null, details: "خاص بالبساتين", priority: "important", status: "missing" });
    createdAlertIds.push(branchOne.id, branchTwo.id);

    expect((await fullCaller.internalAlerts.staff.list()).map(alert => alert.id)).toContain(branchOne.id);
    expect((await fullCaller.internalAlerts.staff.list()).map(alert => alert.id)).not.toContain(branchTwo.id);
    expect((await otherCaller.internalAlerts.staff.list()).map(alert => alert.id)).toContain(branchTwo.id);
    expect((await otherCaller.internalAlerts.staff.list()).map(alert => alert.id)).not.toContain(branchOne.id);
    await expect(viewCaller.internalAlerts.staff.create({ alertType: "important", title: "ممنوع الإنشاء", partName: null, quantity: null, details: null, priority: "normal", status: "missing" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewCaller.internalAlerts.staff.update({ id: branchOne.id, status: "ordered" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewCaller.internalAlerts.staff.remove({ id: branchOne.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fullCaller.internalAlerts.staff.update({ id: branchTwo.id, status: "ordered" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(fullCaller.internalAlerts.staff.remove({ id: branchTwo.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const createdByStaff = await fullCaller.internalAlerts.staff.create({ alertType: "part_shortage", title: "ناقص بطارية اختبار", partName: "بطارية اختبار", quantity: 1, details: "مطلوبة اليوم", priority: "important", status: "missing" });
    createdAlertIds.push(createdByStaff.id);
    expect(createdByStaff).toMatchObject({ branchId: 1, createdByName: full.staff.name, status: "missing" });
    const ordered = await fullCaller.internalAlerts.staff.update({ id: createdByStaff.id, status: "ordered" });
    expect(ordered).toMatchObject({ status: "ordered", updatedByName: full.staff.name });

    const deletedByStaffAlert = await fullCaller.internalAlerts.staff.create({ alertType: "important", title: "تنبيه للحذف الآمن", partName: null, quantity: null, details: "اختبار سلة المحذوفات", priority: "normal", status: "missing" });
    createdAlertIds.push(deletedByStaffAlert.id);
    const deletedByStaff = await fullCaller.internalAlerts.staff.remove({ id: deletedByStaffAlert.id });
    expect(deletedByStaff).toMatchObject({ id: deletedByStaffAlert.id, deleted: true, archived: true, deletedByName: full.staff.name });
    expect((await fullCaller.internalAlerts.staff.list()).some(alert => alert.id === deletedByStaffAlert.id)).toBe(false);
    expect((await owner.internalAlerts.owner.list({ branchId: 1, deleted: true })).some(alert => alert.id === deletedByStaffAlert.id)).toBe(true);
    await owner.internalAlerts.owner.remove({ id: deletedByStaffAlert.id, deleted: false });
    await owner.internalAlerts.owner.archive({ id: deletedByStaffAlert.id, archived: false });
    expect((await fullCaller.internalAlerts.staff.list()).some(alert => alert.id === deletedByStaffAlert.id)).toBe(true);

    await owner.internalAlerts.owner.archive({ id: createdByStaff.id, archived: true });
    expect((await fullCaller.internalAlerts.staff.list()).some(alert => alert.id === createdByStaff.id)).toBe(false);
    expect((await owner.internalAlerts.owner.list({ branchId: 1, archived: true })).some(alert => alert.id === createdByStaff.id)).toBe(true);
    await owner.internalAlerts.owner.archive({ id: createdByStaff.id, archived: false });
    expect((await fullCaller.internalAlerts.staff.list()).some(alert => alert.id === createdByStaff.id)).toBe(true);

    const deleted = await owner.internalAlerts.owner.remove({ id: createdByStaff.id, deleted: true });
    expect(deleted).toMatchObject({ id: createdByStaff.id, deleted: true, archived: true, deletedByName: "المالك" });
    expect((await fullCaller.internalAlerts.staff.list()).some(alert => alert.id === createdByStaff.id)).toBe(false);
    expect((await owner.internalAlerts.owner.list({ branchId: 1, deleted: true })).some(alert => alert.id === createdByStaff.id)).toBe(true);
    expect((await owner.internalAlerts.owner.list({ branchId: 1, archived: true, deleted: false })).some(alert => alert.id === createdByStaff.id)).toBe(false);
    const recovered = await owner.internalAlerts.owner.remove({ id: createdByStaff.id, deleted: false });
    expect(recovered).toMatchObject({ id: createdByStaff.id, deleted: false, archived: true, deletedAt: null, deletedByName: null });
    expect((await owner.internalAlerts.owner.list({ branchId: 1, deleted: true })).some(alert => alert.id === createdByStaff.id)).toBe(false);
    expect((await owner.internalAlerts.owner.list({ branchId: 1, archived: true })).some(alert => alert.id === createdByStaff.id)).toBe(true);

    await expect(visitor.internalAlerts.owner.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(visitor.internalAlerts.staff.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityType, "internal_alert"));
    const actions = logs.filter(log => createdAlertIds.includes(Number(log.entityId))).map(log => log.action);
    expect(actions).toEqual(expect.arrayContaining(["internal_alert.created", "internal_alert.updated", "internal_alert.archived", "internal_alert.restored", "internal_alert.deleted", "internal_alert.recovered"]));
  }, 45_000);
});
