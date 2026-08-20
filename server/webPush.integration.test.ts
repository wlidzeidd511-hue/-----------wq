import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { webPushDeliveries, webPushSubscriptions } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb, purgeIntegrationTestOrders } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";
import { listActivePushBindingsForOrder } from "./webPushDb";

const orderIds: number[] = [];

async function context(owner = false, ownerBranchId = 1): Promise<TrpcContext> {
  const settings = await getShopSettings();
  return {
    user: null,
    ownerSession: owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: owner ? await currentBranchSession(ownerBranchId) : null,
    portalSession: null,
    req: { protocol: "https", headers: { "user-agent": "vitest-web-push", "x-forwarded-for": "127.0.0.81" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  if (orderIds.length) {
    const ids = orderIds.splice(0);
    await db.delete(webPushDeliveries).where(inArray(webPushDeliveries.orderId, ids));
    await db.delete(webPushSubscriptions).where(inArray(webPushSubscriptions.orderId, ids));
  }
  await purgeIntegrationTestOrders();
});

describe("Web Push subscription isolation", () => {
  it("binds one endpoint to the correct order, deduplicates it, and blocks cross-order unsubscribe", async () => {
    const owner = appRouter.createCaller(await context(true, 1));
    const otherOwner = appRouter.createCaller(await context(true, 2));
    const publicCaller = appRouter.createCaller(await context(false));
    const suffix = Date.now().toString().slice(-6);
    const first = await owner.orders.create({ branchId: 1, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت Web Push أول ${suffix}`, customerName: "عميل إشعار أول", customerPhone: `0520${suffix}`, price: 1_000, cost: 200, estimatedTime: 15 });
    const second = await otherOwner.orders.create({ branchId: 2, serviceType: "programming", deviceInfo: `جهاز اختبار تكامل مؤقت Web Push ثاني ${suffix}`, customerName: "عميل إشعار ثاني", customerPhone: `0530${suffix}`, price: 1_000, cost: 200, estimatedTime: 15 });
    orderIds.push(first.order.id, second.order.id);
    const subscription = {
      endpoint: `https://push.example.test/subscription/${suffix}`,
      expirationTime: null,
      keys: { p256dh: "p256dh-key-long-enough-for-validation", auth: "auth-key-long-enough" },
    };

    await publicCaller.webPush.track.subscribe({ token: first.order.publicToken, subscription });
    await publicCaller.webPush.track.subscribe({ token: first.order.publicToken, subscription });
    expect(await listActivePushBindingsForOrder(first.order)).toHaveLength(1);
    expect(await listActivePushBindingsForOrder(second.order)).toHaveLength(0);

    await publicCaller.webPush.track.unsubscribe({ token: second.order.publicToken, endpoint: subscription.endpoint });
    expect(await listActivePushBindingsForOrder(first.order)).toHaveLength(1);
    await publicCaller.webPush.track.unsubscribe({ token: first.order.publicToken, endpoint: subscription.endpoint });
    expect(await listActivePushBindingsForOrder(first.order)).toHaveLength(0);

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const rows = await db.select().from(webPushSubscriptions).where(and(eq(webPushSubscriptions.orderId, first.order.id), eq(webPushSubscriptions.endpoint, subscription.endpoint)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ branchId: 1, isActive: false, source: "order_tracking" });
  }, 60_000);
});
