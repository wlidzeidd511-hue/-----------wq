import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLogs, branchSettings, branches } from "../drizzle/schema";
import type { BranchSessionPayload } from "./branchAuth";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

let branchId: number | null = null;

async function context(branchSession: BranchSessionPayload | null = null) {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const settings = await getShopSettings();
  const ctx: TrpcContext = {
    user: null,
    ownerSession: { kind: "owner", sessionVersion: settings.sessionVersion },
    portalSession: null,
    branchSession,
    req: { protocol: "https", headers: { "user-agent": "vitest-branch-access", "x-forwarded-for": "127.0.0.93" } } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
  return { ctx, cookies };
}

afterEach(async () => {
  const db = await getDb();
  if (!db || !branchId) return;
  await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "branch"), eq(auditLogs.entityId, String(branchId))));
  await db.delete(branchSettings).where(eq(branchSettings.branchId, branchId));
  await db.delete(branches).where(eq(branches.id, branchId));
  branchId = null;
});

describe("owner branch protection", () => {
  it("hashes an independent password, issues a scoped cookie, invalidates old sessions, and never exposes secrets", async () => {
    const ownerContext = await context(await currentBranchSession(1));
    const owner = appRouter.createCaller(ownerContext.ctx);
    const suffix = Date.now().toString();
    const created = await owner.platform.branches.create({ name: `فرع اختبار الحماية ${suffix}`, slug: `secure-${suffix}`, code: `S${suffix.slice(-6)}` });
    branchId = created.id;
    expect(created.protectionConfigured).toBe(false);
    expect(created.settings).not.toHaveProperty("adminPasswordHash");
    expect(created.settings).not.toHaveProperty("adminPasswordSalt");
    expect(created.settings).not.toHaveProperty("sessionVersion");

    const listBefore = await owner.branchAccess.list();
    expect(listBefore.find(branch => branch.id === branchId)?.protectionConfigured).toBe(false);
    const initialized = await owner.branchAccess.initialize({ branchId, newPassword: "Branch#Safe12" });
    expect(initialized).toMatchObject({ authenticated: true, branch: { branchId, branchName: created.name } });
    expect(ownerContext.cookies.at(-1)?.name).toBe("hattef_branch_access");
    expect(ownerContext.cookies.at(-1)?.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", maxAge: 30 * 60 * 1000 });

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [stored] = await db.select().from(branchSettings).where(eq(branchSettings.branchId, branchId)).limit(1);
    expect(stored.adminPasswordHash).toMatch(/^[a-f0-9]{128}$/);
    expect(stored.adminPasswordHash).not.toContain("Branch#Safe12");
    expect(stored.adminPasswordSalt).toMatch(/^[a-f0-9]{32}$/);

    await expect(owner.branchAccess.unlock({ branchId, password: "Wrong#Pass12" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const unlocked = await owner.branchAccess.unlock({ branchId, password: "Branch#Safe12" });
    expect(unlocked.authenticated).toBe(true);

    const branchSession: BranchSessionPayload = { kind: "owner_branch", branchId, sessionVersion: stored.sessionVersion };
    const scopedContext = await context(branchSession);
    const scoped = appRouter.createCaller(scopedContext.ctx);
    await expect(scoped.branchAccess.me()).resolves.toMatchObject({ authenticated: true, branch: { branchId } });
    await expect(scoped.branchAccess.changePassword({ currentPassword: "Wrong#Pass12", newPassword: "NewBranch#Safe13" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const changed = await scoped.branchAccess.changePassword({ currentPassword: "Branch#Safe12", newPassword: "NewBranch#Safe13" });
    expect(changed).toMatchObject({ success: true, branch: { branchId, sessionVersion: stored.sessionVersion + 1 } });
    expect(scopedContext.cookies.at(-1)?.name).toBe("hattef_branch_access");
    const [changedStored] = await db.select().from(branchSettings).where(eq(branchSettings.branchId, branchId)).limit(1);
    expect(changedStored.sessionVersion).toBe(stored.sessionVersion + 1);
    expect(changedStored.adminPasswordHash).not.toBe(stored.adminPasswordHash);
    await expect(owner.branchAccess.unlock({ branchId, password: "Branch#Safe12" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(owner.branchAccess.unlock({ branchId, password: "NewBranch#Safe13" })).resolves.toMatchObject({ authenticated: true });
    await expect(scoped.branchAccess.me()).resolves.toEqual({ authenticated: false, branch: null });

    const [changeAudit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "branch"), eq(auditLogs.entityId, String(branchId)), eq(auditLogs.action, "branch.protection.changed"))).limit(1);
    expect(changeAudit).toMatchObject({ actorType: "owner", branchId });

    const publicCaller = appRouter.createCaller({ ...(await context()).ctx, ownerSession: null });
    const publicBranch = (await publicCaller.platform.branches.publicList()).find(branch => branch.id === branchId);
    expect(publicBranch?.settings).not.toHaveProperty("adminPasswordHash");
    expect(publicBranch?.settings).not.toHaveProperty("adminPasswordSalt");
    expect(publicBranch?.settings).not.toHaveProperty("sessionVersion");
    expect(publicBranch?.settings).not.toHaveProperty("whatsappPhoneNumberId");
    const waiting = await publicCaller.platform.content.waitingPublic({ slug: created.slug });
    expect(waiting?.settings).not.toHaveProperty("adminPasswordHash");
    expect(waiting?.settings).not.toHaveProperty("adminPasswordSalt");
    expect(waiting?.settings).not.toHaveProperty("sessionVersion");
  }, 30_000);
});
