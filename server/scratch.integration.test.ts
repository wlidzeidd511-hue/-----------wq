import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { auditLogs, customers, scratchCampaigns, scratchCodes, scratchPrizes } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getCustomerById } from "./accountDb";
import { getDb, purgeIntegrationTestOrders } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

const campaignIds: number[] = [];
const customerIds: number[] = [];

async function context(input: { owner?: boolean; ownerBranchId?: number; customerId?: number } = {}): Promise<TrpcContext> {
  const settings = await getShopSettings();
  const customer = input.customerId ? await getCustomerById(input.customerId) : null;
  return {
    user: null,
    ownerSession: input.owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: input.owner ? await currentBranchSession(input.ownerBranchId ?? 1) : null,
    portalSession: customer ? { kind: "customer", accountId: customer.id, sessionVersion: customer.sessionVersion } : null,
    req: { protocol: "https", headers: { "user-agent": "vitest-scratch" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  await purgeIntegrationTestOrders();
  if (campaignIds.length) {
    const ids = campaignIds.splice(0);
    await db.delete(scratchCodes).where(inArray(scratchCodes.campaignId, ids));
    await db.delete(scratchPrizes).where(inArray(scratchPrizes.campaignId, ids));
    await db.delete(scratchCampaigns).where(inArray(scratchCampaigns.id, ids));
    await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "scratch_campaign"), inArray(auditLogs.entityId, ids.map(String))));
  }
  if (customerIds.length) await db.delete(customers).where(inArray(customers.id, customerIds.splice(0)));
});

describe("Monthly scratch and win", () => {
  it("generates 100 secure slots, assigns for 72 hours, redeems once, and isolates customers", async () => {
    const owner = appRouter.createCaller(await context({ owner: true, ownerBranchId: 1 }));
    const campaign = await owner.scratch.admin.ensure({ branchId: 1, monthKey: "2099-12", codeCount: 100 });
    campaignIds.push(campaign.id);
    await owner.scratch.admin.addPrize({ campaignId: campaign.id, name: "جائزة اختبار", description: "تستلم من الفرع", quantity: 2, isWinning: true, isActive: true });
    const generated = await owner.scratch.admin.generate({ campaignId: campaign.id, redistribute: true });
    expect(generated?.stats).toMatchObject({ total: 100, winningSlots: 2, available: 100 });

    const suffix = Date.now().toString().slice(-6);
    const firstOrder = await owner.orders.create({ branchId: 1, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت كشط أول ${suffix}`, customerName: "عميل الكشط الأول", customerPhone: `0500${suffix}`, price: 10_000, cost: 4_000, estimatedTime: 60 });
    const secondOrder = await owner.orders.create({ branchId: 1, serviceType: "programming", deviceInfo: `جهاز اختبار تكامل مؤقت كشط ثاني ${suffix}`, customerName: "عميل الكشط الثاني", customerPhone: `0510${suffix}`, price: 8_000, cost: 3_000, estimatedTime: 60 });
    if (!firstOrder.order.customerId || !secondOrder.order.customerId) throw new Error("Test customer was not created");
    customerIds.push(firstOrder.order.customerId, secondOrder.order.customerId);

    const assigned = await owner.scratch.admin.assignOrder({ orderId: firstOrder.order.id, campaignId: campaign.id });
    expect(assigned).toBeTruthy();
    expect(assigned?.status).toBe("assigned");
    expect((assigned?.expiresAt ?? 0) - (assigned?.assignedAt ?? 0)).toBe(72 * 60 * 60 * 1000);

    const firstCustomer = appRouter.createCaller(await context({ customerId: firstOrder.order.customerId }));
    const secondCustomer = appRouter.createCaller(await context({ customerId: secondOrder.order.customerId }));
    const before = await firstCustomer.scratch.customer.list();
    const code = before.find(item => item.orderId === firstOrder.order.id);
    expect(code).toMatchObject({ status: "assigned", prizeName: null, isWinning: null, orderBarcode: firstOrder.order.barcode });
    if (!code) throw new Error("Assigned code missing");
    await expect(secondCustomer.scratch.customer.get({ code: code.publicCode })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const firstReveal = await firstCustomer.scratch.customer.redeem({ code: code.publicCode });
    const secondReveal = await firstCustomer.scratch.customer.redeem({ code: code.publicCode });
    expect(firstReveal.status).toBe("redeemed");
    expect(secondReveal.status).toBe("redeemed");
    expect(secondReveal.redeemedAt).toBe(firstReveal.redeemedAt);

    const secondAssigned = await owner.scratch.admin.assignOrder({ orderId: secondOrder.order.id, campaignId: campaign.id });
    if (!secondAssigned) throw new Error("Second code missing");
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.update(scratchCodes).set({ expiresAt: Date.now() - 1 }).where(eq(scratchCodes.id, secondAssigned.id));
    const expiredList = await secondCustomer.scratch.customer.list();
    expect(expiredList.find(item => item.id === secondAssigned.id)?.status).toBe("expired");
  }, 30_000);

  it("configures 100 codes in one action, keeps remaining slots losing, and isolates branches", async () => {
    const owner = appRouter.createCaller(await context({ owner: true, ownerBranchId: 1 }));
    const otherOwner = appRouter.createCaller(await context({ owner: true, ownerBranchId: 2 }));
    const branchOne = await owner.scratch.admin.configureAndGenerate({
      branchId: 1,
      monthKey: "2099-10",
      prizes: [
        { name: "ستيكر", description: "ستيكر هاتف التميز", quantity: 10 },
        { name: "تنظيف", description: "تنظيف جهاز مجاني", quantity: 10 },
        { name: "خصم", description: "خصم يحدد عند الاستلام", quantity: 10 },
      ],
    });
    const branchTwo = await otherOwner.scratch.admin.configureAndGenerate({
      branchId: 2,
      monthKey: "2099-10",
      prizes: [{ name: "جائزة البساتين", quantity: 5 }],
    });
    if (!branchOne || !branchTwo) throw new Error("Scratch campaign was not created");
    campaignIds.push(branchOne.campaign.id, branchTwo.campaign.id);

    expect(branchOne.campaign).toMatchObject({ branchId: 1, codeCount: 100 });
    expect(branchOne.stats).toMatchObject({ total: 100, available: 100, winningSlots: 30 });
    expect(branchOne.prizes.map(prize => ({ name: prize.name, quantity: prize.quantity }))).toEqual([
      { name: "ستيكر", quantity: 10 },
      { name: "تنظيف", quantity: 10 },
      { name: "خصم", quantity: 10 },
    ]);
    expect(branchTwo.stats).toMatchObject({ total: 100, winningSlots: 5 });

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const firstCodes = await db.select().from(scratchCodes).where(eq(scratchCodes.campaignId, branchOne.campaign.id));
    const secondCodes = await db.select().from(scratchCodes).where(eq(scratchCodes.campaignId, branchTwo.campaign.id));
    expect(firstCodes).toHaveLength(100);
    expect(firstCodes.filter(code => code.prizeId !== null)).toHaveLength(30);
    expect(firstCodes.filter(code => code.prizeId === null)).toHaveLength(70);
    expect(secondCodes).toHaveLength(100);
    expect(secondCodes.filter(code => code.prizeId !== null)).toHaveLength(5);
    expect(new Set(firstCodes.map(code => code.publicCode)).size).toBe(100);

    const branchOneList = await owner.scratch.admin.list({ branchId: 1 });
    const branchTwoList = await otherOwner.scratch.admin.list({ branchId: 2 });
    expect(branchOneList.some(row => row.campaign.id === branchOne.campaign.id)).toBe(true);
    expect(branchOneList.some(row => row.campaign.id === branchTwo.campaign.id)).toBe(false);
    expect(branchTwoList.some(row => row.campaign.id === branchTwo.campaign.id)).toBe(true);

    await expect(owner.scratch.admin.configureAndGenerate({
      branchId: 1,
      monthKey: "2099-09",
      prizes: [{ name: "كمية زائدة", quantity: 100 }, { name: "زيادة", quantity: 1 }],
    })).rejects.toThrow();
  }, 30_000);
});
