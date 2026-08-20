import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { customers, serviceOrders } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getCustomerById } from "./accountDb";
import { getDb, purgeIntegrationTestOrders } from "./db";
import { getCustomerLoyaltyProfile } from "./loyaltyDb";
import { appRouter } from "./routers";
import { getShopSettings, updateShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

const customerIds: number[] = [];
let originalThresholds: { regular: number; distinguished: number; vip: number } | null = null;

async function context(input: { owner?: boolean; customerId?: number } = {}): Promise<TrpcContext> {
  const settings = await getShopSettings();
  const customer = input.customerId ? await getCustomerById(input.customerId) : null;
  return {
    user: null,
    ownerSession: input.owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: input.owner ? await currentBranchSession(1) : null,
    portalSession: customer ? { kind: "customer", accountId: customer.id, sessionVersion: customer.sessionVersion } : null,
    req: { protocol: "https", headers: { "user-agent": "vitest-loyalty" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

beforeEach(async () => {
  const settings = await getShopSettings();
  originalThresholds = {
    regular: settings.loyaltyRegularOrderThreshold,
    distinguished: settings.loyaltyDistinguishedSpendThreshold,
    vip: settings.loyaltyVipSpendThreshold,
  };
  await updateShopSettings({
    loyaltyRegularOrderThreshold: 3,
    loyaltyDistinguishedSpendThreshold: 150_000,
    loyaltyVipSpendThreshold: 500_000,
  });
});

afterEach(async () => {
  await purgeIntegrationTestOrders();
  const db = await getDb();
  if (db && customerIds.length) await db.delete(customers).where(inArray(customers.id, customerIds.splice(0)));
  if (originalThresholds) {
    await updateShopSettings({
      loyaltyRegularOrderThreshold: originalThresholds.regular,
      loyaltyDistinguishedSpendThreshold: originalThresholds.distinguished,
      loyaltyVipSpendThreshold: originalThresholds.vip,
    });
  }
});

describe("Customer loyalty tiers", () => {
  it("promotes the same customer through new, regular, distinguished, and VIP tiers", async () => {
    const owner = appRouter.createCaller(await context({ owner: true }));
    const suffix = Date.now().toString().slice(-7);
    const phone = `052${suffix}`;
    const first = await owner.orders.create({ branchId: 1, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت وسام 1 ${suffix}`, customerName: "عميل الوسام", customerPhone: phone, price: 60_000, cost: 0, estimatedTime: 30 });
    if (!first.order.customerId) throw new Error("Customer was not created");
    customerIds.push(first.order.customerId);
    expect((await getCustomerLoyaltyProfile(first.order.customerId)).tier).toBe("new");

    const second = await owner.orders.create({ branchId: 1, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت وسام 2 ${suffix}`, customerName: "عميل الوسام", customerPhone: phone, price: 60_000, cost: 0, estimatedTime: 30 });
    const third = await owner.orders.create({ branchId: 1, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت وسام 3 ${suffix}`, customerName: "عميل الوسام", customerPhone: phone, price: 40_000, cost: 0, estimatedTime: 30 });
    expect((await getCustomerLoyaltyProfile(first.order.customerId)).tier).toBe("regular");

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.update(serviceOrders).set({ status: "delivered" }).where(inArray(serviceOrders.id, [first.order.id, second.order.id, third.order.id]));
    expect((await getCustomerLoyaltyProfile(first.order.customerId)).tier).toBe("distinguished");

    await db.update(serviceOrders).set({ price: 400_000 }).where(eq(serviceOrders.id, first.order.id));
    const vip = await getCustomerLoyaltyProfile(first.order.customerId);
    expect(vip).toMatchObject({ tier: "vip", label: "عميل VIP", orderCount: 3, deliveredCount: 3, totalDeliveredSpend: 500_000 });

    const ownerView = await owner.accounts.customerLoyalty({ customerId: first.order.customerId });
    expect(ownerView.tier).toBe("vip");
    const orderView = await owner.accounts.orderLoyalty({ orderId: first.order.id });
    expect(orderView?.tier).toBe("vip");
    const customerCaller = appRouter.createCaller(await context({ customerId: first.order.customerId }));
    const me = await customerCaller.accounts.customer.me();
    expect(me).toMatchObject({ authenticated: true, loyalty: { tier: "vip", label: "عميل VIP" } });

    const updatedSettings = await owner.settings.update({ loyaltyRegularOrderThreshold: 5, loyaltyDistinguishedSpendThreshold: 200_000, loyaltyVipSpendThreshold: 600_000 });
    expect(updatedSettings).toMatchObject({ loyaltyRegularOrderThreshold: 5, loyaltyDistinguishedSpendThreshold: 200_000, loyaltyVipSpendThreshold: 600_000 });
  }, 40_000);
});
