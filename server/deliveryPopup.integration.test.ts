import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { branchSettings, serviceOrders } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb, purgeIntegrationTestOrders } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";

async function context(owner = false): Promise<TrpcContext> {
  const settings = await getShopSettings();
  const db = await getDb();
  const [branch] = db ? await db.select({ sessionVersion: branchSettings.sessionVersion }).from(branchSettings).where(eq(branchSettings.branchId, 1)).limit(1) : [];
  return {
    user: null,
    ownerSession: owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: owner ? { kind: "owner_branch", branchId: 1, sessionVersion: branch?.sessionVersion ?? 1 } : null,
    portalSession: null,
    req: { protocol: "https", headers: { "user-agent": "vitest-delivery-popup" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  await purgeIntegrationTestOrders();
});

describe("delivery popup claim", () => {
  it("shows once per delivered invoice and atomically rejects later devices", async () => {
    const owner = appRouter.createCaller(await context(true));
    const visitor = appRouter.createCaller(await context(false));
    const created = await owner.orders.create({
      branchId: 1,
      serviceType: "maintenance",
      deviceInfo: `جهاز اختبار تكامل مؤقت نافذة التسليم ${Date.now()}`,
      price: 10_000,
      cost: 0,
      estimatedTime: 30,
    });

    await expect(visitor.engagement.claimDeliveryPopup({ orderToken: created.publicToken })).resolves.toEqual({ show: false });
    await owner.orders.updateStatus({ id: created.order.id, status: "delivered", note: "تم التسليم", visibleToCustomer: true });

    const claims = await Promise.all([
      visitor.engagement.claimDeliveryPopup({ orderToken: created.publicToken }),
      visitor.engagement.claimDeliveryPopup({ orderToken: created.publicToken }),
    ]);
    expect(claims.filter(claim => claim.show)).toHaveLength(1);
    expect(claims.filter(claim => !claim.show)).toHaveLength(1);

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [saved] = await db.select({ seenAt: serviceOrders.deliveryPopupSeenAt }).from(serviceOrders).where(eq(serviceOrders.id, created.order.id)).limit(1);
    expect(saved.seenAt).toEqual(expect.any(Number));
    await expect(visitor.engagement.claimDeliveryPopup({ orderToken: created.publicToken })).resolves.toEqual({ show: false });
  }, 30_000);

  it("shows each exact repair status once and ignores saving the same status again", async () => {
    const owner = appRouter.createCaller(await context(true));
    const visitor = appRouter.createCaller(await context(false));
    const created = await owner.orders.create({
      branchId: 1,
      serviceType: "maintenance",
      deviceInfo: `جهاز اختبار تكامل مؤقت Popup الحالات ${Date.now()}`,
      price: 8_000,
      cost: 0,
      estimatedTime: 45,
    });

    await owner.orders.updateStatus({ id: created.order.id, status: "diagnosing", note: "قيد الفحص", visibleToCustomer: true });
    const diagnosingClaims = await Promise.all([
      visitor.engagement.claimStatusPopup({ orderToken: created.publicToken, status: "diagnosing" }),
      visitor.engagement.claimStatusPopup({ orderToken: created.publicToken, status: "diagnosing" }),
    ]);
    expect(diagnosingClaims.filter(claim => claim.show)).toHaveLength(1);
    expect(diagnosingClaims.filter(claim => !claim.show)).toHaveLength(1);

    const beforeDuplicateSave = await owner.orders.getById({ id: created.order.id });
    await owner.orders.updateStatus({ id: created.order.id, status: "diagnosing", note: "حفظ مكرر", visibleToCustomer: true });
    const afterDuplicateSave = await owner.orders.getById({ id: created.order.id });
    expect(afterDuplicateSave?.history).toHaveLength(beforeDuplicateSave?.history.length ?? 0);
    await expect(visitor.engagement.claimStatusPopup({ orderToken: created.publicToken, status: "diagnosing" })).resolves.toEqual({ show: false });

    await owner.orders.updateStatus({ id: created.order.id, status: "in_progress", note: "جاري العمل", visibleToCustomer: true });
    await expect(visitor.engagement.claimStatusPopup({ orderToken: created.publicToken, status: "diagnosing" })).resolves.toEqual({ show: false });
    const progressClaims = await Promise.all([
      visitor.engagement.claimStatusPopup({ orderToken: created.publicToken, status: "in_progress" }),
      visitor.engagement.claimStatusPopup({ orderToken: created.publicToken, status: "in_progress" }),
    ]);
    expect(progressClaims.filter(claim => claim.show)).toHaveLength(1);
    expect(progressClaims.filter(claim => !claim.show)).toHaveLength(1);
  }, 30_000);
});
