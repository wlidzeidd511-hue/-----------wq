import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { auditLogs, branchContent, branchSettings, branches } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

const branchIds: number[] = [];

async function context(owner = false, ownerBranchId = 1): Promise<TrpcContext> {
  const settings = await getShopSettings();
  return {
    user: null,
    ownerSession: owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: owner ? await currentBranchSession(ownerBranchId) : null,
    portalSession: null,
    req: { protocol: "https", headers: { "user-agent": "vitest-waiting-screen" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db || !branchIds.length) return;
  const ids = branchIds.splice(0);
  await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "branch"), inArray(auditLogs.entityId, ids.map(String))));
  await db.delete(branchContent).where(inArray(branchContent.branchId, ids));
  await db.delete(branchSettings).where(inArray(branchSettings.branchId, ids));
  await db.delete(branches).where(inArray(branches.id, ids));
});

describe("Branch contact and waiting screen", () => {
  it("lets the owner edit each branch screen and exposes only active branch contact data publicly", async () => {
    const bootstrapOwner = appRouter.createCaller(await context(true, 1));
    const publicCaller = appRouter.createCaller(await context(false));
    const suffix = Date.now().toString().slice(-8);
    const branch = await bootstrapOwner.platform.branches.create({ name: `فرع شاشة اختبار ${suffix}`, slug: `waiting-${suffix}`, code: `W${suffix}` });
    if (!branch) throw new Error("Branch was not created");
    branchIds.push(branch.id);
    const otherBranch = await bootstrapOwner.platform.branches.create({ name: `فرع خريطة اختبار ${suffix}`, slug: `map-${suffix}`, code: `M${suffix}` });
    if (!otherBranch) throw new Error("Second branch was not created");
    branchIds.push(otherBranch.id);
    const owner = appRouter.createCaller(await context(true, branch.id));
    const otherOwner = appRouter.createCaller(await context(true, otherBranch.id));
    await owner.platform.branches.updateSettings({
      branchId: branch.id,
      displayName: `هاتف التميز - شاشة ${suffix}`,
      phone: "0160000000",
      whatsappPhone: "0550000000",
      address: "عنوان اختبار مؤقت",
      openingHours: "يوميًا 9 ص - 10 م",
      mapUrl: "https://maps.google.com/?q=26,44",
      waitingScreenEnabled: true,
    });
    await otherOwner.platform.branches.updateSettings({
      branchId: otherBranch.id,
      displayName: `هاتف التميز - خريطة ${suffix}`,
      phone: "0161111111",
      whatsappPhone: "0551111111",
      address: "عنوان فرع الخريطة الآخر",
      openingHours: "يوميًا 10 ص - 11 م",
      mapUrl: "https://maps.google.com/?q=27,45",
      waitingScreenEnabled: true,
    });

    const defaults = await owner.platform.content.waitingOwner({ branchId: branch.id });
    expect(defaults?.content.title).toContain("جهازك");
    const saved = await owner.platform.content.updateWaiting({ branchId: branch.id, title: "نخدم جهازك بكل اهتمام", body: "تابع طلبك من الرابط الآمن، وكل تحديث يوصلك أولًا بأول.", isActive: true });
    expect(saved?.content).toMatchObject({ title: "نخدم جهازك بكل اهتمام", isActive: true });

    const publicScreen = await publicCaller.platform.content.waitingPublic({ slug: branch.slug });
    expect(publicScreen).toMatchObject({ branch: { id: branch.id, isActive: true }, settings: { whatsappPhone: "0550000000", mapUrl: "https://maps.google.com/?q=26,44", waitingScreenEnabled: true }, content: { title: "نخدم جهازك بكل اهتمام", isActive: true } });
    const publicBranches = await publicCaller.platform.branches.publicList();
    const publicBranch = publicBranches.find(item => item.id === branch.id);
    const publicOtherBranch = publicBranches.find(item => item.id === otherBranch.id);
    expect(publicBranch?.settings).toMatchObject({ phone: "0160000000", whatsappPhone: "0550000000", address: "عنوان اختبار مؤقت", mapUrl: "https://maps.google.com/?q=26,44" });
    expect(publicOtherBranch?.settings).toMatchObject({ phone: "0161111111", whatsappPhone: "0551111111", address: "عنوان فرع الخريطة الآخر", mapUrl: "https://maps.google.com/?q=27,45" });
    expect(publicBranch?.settings.mapUrl).not.toBe(publicOtherBranch?.settings.mapUrl);
    expect(publicBranch?.settings).not.toHaveProperty("whatsappPhoneNumberId");

    await owner.platform.content.updateWaiting({ branchId: branch.id, title: "نخدم جهازك بكل اهتمام", body: "تم إيقاف عرض الرسالة مؤقتًا.", isActive: false });
    const disabled = await publicCaller.platform.content.waitingPublic({ slug: branch.slug });
    expect(disabled?.content.isActive).toBe(false);
  }, 30_000);
});
