import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLogs, staffAccounts, staffBranchAssignments } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import type { PortalSessionPayload } from "./accountAuth";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

const createdStaffIds: number[] = [];

async function context(owner = false, branchId = 1): Promise<TrpcContext> {
  const settings = await getShopSettings();
  return {
    user: null,
    ownerSession: owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: owner ? await currentBranchSession(branchId) : null,
    portalSession: null,
    req: {
      protocol: "https",
      headers: { "user-agent": "vitest-staff-username", "x-forwarded-for": "127.0.0.96" },
      socket: { remoteAddress: "127.0.0.96" },
    } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

async function staffContext(portalSession: PortalSessionPayload): Promise<TrpcContext> {
  return { ...(await context(false)), portalSession };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  for (const id of createdStaffIds.splice(0).reverse()) {
    await db.delete(staffBranchAssignments).where(eq(staffBranchAssignments.staffId, id));
    await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "staff"), eq(auditLogs.entityId, String(id))));
    await db.delete(staffAccounts).where(eq(staffAccounts.id, id));
  }
});

describe("Arabic staff usernames", () => {
  it("normalizes spaces, rejects duplicates clearly, and permits login", async () => {
    const owner = appRouter.createCaller(await context(true));
    const publicCaller = appRouter.createCaller(await context(false));
    const rawUsername = ` موظف اختبار ${Date.now()} `;
    const created = await owner.accounts.staff.create({
      branchId: 1,
      name: "وليد اختبار",
      username: rawUsername,
      permissions: ["orders.view_branch", "orders.create"],
    });
    createdStaffIds.push(created.staff!.id);
    expect(created.staff?.username).toBe(rawUsername.normalize("NFKC").trim().replace(/\s+/g, "").toLowerCase());

    await expect(owner.accounts.staff.create({
      branchId: 1,
      name: "موظف مكرر",
      username: rawUsername,
      permissions: ["orders.view_branch"],
    })).rejects.toMatchObject({ code: "CONFLICT", message: "اسم الدخول مستخدم من موظف آخر" });

    const login = await publicCaller.accounts.staff.login({ username: rawUsername, password: created.temporaryPassword });
    expect(login).toMatchObject({ authenticated: true, staff: { id: created.staff!.id, username: created.staff!.username } });
  }, 30_000);

  it("uses the requested initial password, preserves permissions, and revokes old sessions after a permanent password change", async () => {
    const owner = appRouter.createCaller(await context(true));
    const publicCaller = appRouter.createCaller(await context(false));
    const username = `password-test-${Date.now()}`;
    const created = await owner.accounts.staff.create({
      branchId: 1,
      name: "موظف اختبار كلمة المرور",
      username,
      permissions: ["orders.view_branch", "orders.create"],
    });
    if (!created.staff) throw new Error("Staff setup failed");
    createdStaffIds.push(created.staff.id);
    expect(created.temporaryPassword).toBe("12Qwaszx*");

    const initialLogin = await publicCaller.accounts.staff.login({ username, password: "12Qwaszx*" });
    expect(initialLogin.staff).toMatchObject({
      id: created.staff.id,
      branchId: 1,
      permissionsList: ["orders.view_branch", "orders.create"],
    });
    const oldSession = {
      kind: "staff" as const,
      accountId: initialLogin.staff.id,
      branchId: initialLogin.staff.branchId,
      sessionVersion: initialLogin.staff.sessionVersion,
    };

    const changed = await owner.accounts.staff.setPassword({ id: created.staff.id, newPassword: "Permanent9!Pass" });
    expect(changed).toMatchObject({ success: true, staff: { id: created.staff.id, branchId: 1 } });
    expect(changed.staff?.sessionVersion).toBe(initialLogin.staff.sessionVersion + 1);
    expect(changed.staff?.permissionsList).toEqual(["orders.view_branch", "orders.create"]);

    await expect(publicCaller.accounts.staff.login({ username, password: "12Qwaszx*" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const permanentLogin = await publicCaller.accounts.staff.login({ username, password: "Permanent9!Pass" });
    expect(permanentLogin.staff).toMatchObject({
      id: created.staff.id,
      branchId: 1,
      permissionsList: ["orders.view_branch", "orders.create"],
    });

    const oldSessionCaller = appRouter.createCaller(await staffContext(oldSession));
    await expect(oldSessionCaller.staff.summary()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "STAFF_SESSION_EXPIRED" });
    const newSessionCaller = appRouter.createCaller(await staffContext({
      kind: "staff",
      accountId: permanentLogin.staff.id,
      branchId: permanentLogin.staff.branchId,
      sessionVersion: permanentLogin.staff.sessionVersion,
    }));
    await expect(newSessionCaller.staff.summary()).resolves.toEqual(expect.objectContaining({ total: expect.any(Number) }));
  }, 30_000);

  it("safely deletes a staff account, hides it from the list, revokes its session, and records the actor time", async () => {
    const owner = appRouter.createCaller(await context(true));
    const publicCaller = appRouter.createCaller(await context(false));
    const username = `delete-test-${Date.now()}`;
    const created = await owner.accounts.staff.create({
      branchId: 1,
      name: "موظف اختبار الحذف",
      username,
      permissions: ["orders.view_branch"],
    });
    if (!created.staff) throw new Error("Staff setup failed");
    createdStaffIds.push(created.staff.id);
    const login = await publicCaller.accounts.staff.login({ username, password: created.temporaryPassword });
    const oldSession = {
      kind: "staff" as const,
      accountId: login.staff.id,
      branchId: login.staff.branchId,
      sessionVersion: login.staff.sessionVersion,
    };

    const removed = await owner.accounts.staff.remove({ id: created.staff.id });
    expect(removed).toMatchObject({ success: true, deleted: { id: created.staff.id, branchId: 1 } });
    expect((await owner.accounts.staff.list()).some(staff => staff.id === created.staff!.id)).toBe(false);
    await expect(publicCaller.accounts.staff.login({ username, password: created.temporaryPassword })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(appRouter.createCaller(await staffContext(oldSession)).staff.summary()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "STAFF_SESSION_EXPIRED" });

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [stored] = await db.select().from(staffAccounts).where(eq(staffAccounts.id, created.staff.id)).limit(1);
    expect(stored).toMatchObject({ isActive: false, roleKey: "deleted", permissions: "[]", sessionVersion: oldSession.sessionVersion + 1 });
    expect(stored.username).not.toBe(username);
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "staff"), eq(auditLogs.entityId, String(created.staff.id)), eq(auditLogs.action, "staff.deleted"))).limit(1);
    expect(audit).toMatchObject({ actorType: "owner", branchId: 1 });
    expect(audit.createdAt).toBeTruthy();
  }, 30_000);

  it("transfers a staff account to the other branch, revokes the old session, and records the new branch", async () => {
    const sourceOwner = appRouter.createCaller(await context(true, 1));
    const targetOwner = appRouter.createCaller(await context(true, 2));
    const publicCaller = appRouter.createCaller(await context(false));
    const username = `transfer-test-${Date.now()}`;
    const created = await sourceOwner.accounts.staff.create({
      branchId: 1,
      name: "موظف اختبار النقل",
      username,
      permissions: ["orders.view_branch", "orders.create", "customers.create"],
    });
    if (!created.staff) throw new Error("Staff setup failed");
    createdStaffIds.push(created.staff.id);
    const login = await publicCaller.accounts.staff.login({ username, password: created.temporaryPassword });
    const oldSession = {
      kind: "staff" as const,
      accountId: login.staff.id,
      branchId: login.staff.branchId,
      sessionVersion: login.staff.sessionVersion,
    };

    const transferred = await sourceOwner.accounts.staff.transferBranch({ id: created.staff.id, targetBranchId: 2 });
    expect(transferred).toMatchObject({ success: true, staff: { id: created.staff.id, branchId: 2 } });
    expect(transferred.staff?.sessionVersion).toBe(oldSession.sessionVersion + 1);
    await expect(appRouter.createCaller(await staffContext(oldSession)).staff.summary()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "STAFF_SESSION_EXPIRED" });

    const newLogin = await publicCaller.accounts.staff.login({ username, password: created.temporaryPassword });
    expect(newLogin.staff).toMatchObject({ id: created.staff.id, branchId: 2 });
    expect((await sourceOwner.accounts.staff.list()).some(staff => staff.id === created.staff!.id)).toBe(false);
    expect((await targetOwner.accounts.staff.list()).some(staff => staff.id === created.staff!.id)).toBe(true);

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "staff"), eq(auditLogs.entityId, String(created.staff.id)), eq(auditLogs.action, "staff.branch.transferred"))).limit(1);
    expect(audit).toMatchObject({ actorType: "owner", branchId: 1 });
  }, 30_000);

  it("updates the staff username, rejects a duplicate, and revokes the previous session", async () => {
    const owner = appRouter.createCaller(await context(true, 1));
    const publicCaller = appRouter.createCaller(await context(false));
    const suffix = Date.now();
    const first = await owner.accounts.staff.create({
      branchId: 1,
      name: "موظف تعديل اسم الدخول",
      username: `rename-before-${suffix}`,
      permissions: ["orders.view_branch", "orders.update_intake"],
    });
    const second = await owner.accounts.staff.create({
      branchId: 1,
      name: "موظف منع التكرار",
      username: `rename-taken-${suffix}`,
      permissions: ["orders.view_branch"],
    });
    if (!first.staff || !second.staff) throw new Error("Staff setup failed");
    createdStaffIds.push(first.staff.id, second.staff.id);

    const login = await publicCaller.accounts.staff.login({ username: first.staff.username, password: first.temporaryPassword });
    const oldSession = { kind: "staff" as const, accountId: login.staff.id, branchId: 1, sessionVersion: login.staff.sessionVersion };
    const renamedUsername = `rename-after-${suffix}`;
    const renamed = await owner.accounts.staff.update({ id: first.staff.id, username: renamedUsername });
    expect(renamed).toMatchObject({ id: first.staff.id, username: renamedUsername, branchId: 1 });
    expect(renamed?.sessionVersion).toBe(oldSession.sessionVersion + 1);

    await expect(publicCaller.accounts.staff.login({ username: first.staff.username, password: first.temporaryPassword })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(appRouter.createCaller(await staffContext(oldSession)).staff.summary()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "STAFF_SESSION_EXPIRED" });
    const newLogin = await publicCaller.accounts.staff.login({ username: renamedUsername, password: first.temporaryPassword });
    expect(newLogin.staff.permissionsList).toEqual(["orders.view_branch", "orders.update_intake"]);

    await expect(owner.accounts.staff.update({ id: first.staff.id, username: second.staff.username })).rejects.toMatchObject({ code: "CONFLICT", message: "اسم الدخول مستخدم من موظف آخر" });
  }, 30_000);
});
