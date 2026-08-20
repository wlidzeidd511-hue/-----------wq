import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { auditLogs, branchSettings, branches, customers, serviceOrders } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getCustomerById } from "./accountDb";
import { getDb, purgeIntegrationTestOrders } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

const customerIds: number[] = [];
const orderIds: number[] = [];
const ratingIds: number[] = [];
const branchIds: number[] = [];

async function context(input: { owner?: boolean; ownerBranchId?: number; customerId?: number } = {}): Promise<TrpcContext> {
  const settings = await getShopSettings();
  const customer = input.customerId ? await getCustomerById(input.customerId) : null;
  return {
    user: null,
    ownerSession: input.owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: input.owner ? await currentBranchSession(input.ownerBranchId ?? 1) : null,
    portalSession: customer ? { kind: "customer", accountId: customer.id, sessionVersion: customer.sessionVersion } : null,
    req: { protocol: "https", headers: { "user-agent": "vitest-ratings" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  await purgeIntegrationTestOrders();
  if (ratingIds.length) await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "service_rating"), inArray(auditLogs.entityId, ratingIds.splice(0).map(String))));
  if (orderIds.length) await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "service_order"), inArray(auditLogs.entityId, orderIds.splice(0).map(String))));
  if (customerIds.length) await db.delete(customers).where(inArray(customers.id, customerIds.splice(0)));
  for (const branchId of branchIds.splice(0)) {
    await db.delete(branchSettings).where(eq(branchSettings.branchId, branchId));
    await db.delete(branches).where(eq(branches.id, branchId));
  }
});

describe("Post-delivery ratings", () => {
  it("stores real ratings once, routes dissatisfied customers to a branch, and protects customer orders", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const suffix = Date.now().toString().slice(-8);
    const insertedBranch = await db.insert(branches).values({ name: `فرع اختبار التقييم ${suffix}`, slug: `rating-${suffix}`, code: `R${suffix}`, isActive: true });
    const branchId = Number(insertedBranch[0].insertId);
    branchIds.push(branchId);
    await db.insert(branchSettings).values({ branchId, displayName: `فرع اختبار التقييم ${suffix}`, whatsappPhone: "0550000000", mapsReviewUrl: "https://maps.google.com/?cid=12345", currency: "ر.س" });

    const owner = appRouter.createCaller(await context({ owner: true, ownerBranchId: branchId }));
    const first = await owner.orders.create({ branchId, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت تقييم 1 ${suffix}`, customerName: "عميل التقييم", customerPhone: `053${suffix.slice(1)}`, price: 10_000, cost: 0, estimatedTime: 30 });
    const second = await owner.orders.create({ branchId, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت تقييم 2 ${suffix}`, customerName: "عميل التقييم", customerPhone: first.order.customerPhone ?? `053${suffix.slice(1)}`, price: 20_000, cost: 0, estimatedTime: 30 });
    const intruder = await owner.orders.create({ branchId, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت تقييم دخيل ${suffix}`, customerName: "عميل آخر", customerPhone: `054${suffix.slice(1)}`, price: 5_000, cost: 0, estimatedTime: 30 });
    if (!first.order.customerId || !intruder.order.customerId) throw new Error("Customers were not created");
    customerIds.push(first.order.customerId, intruder.order.customerId);
    orderIds.push(first.order.id, second.order.id, intruder.order.id);
    await db.update(serviceOrders).set({ status: "delivered", deliveredAt: Date.now() }).where(inArray(serviceOrders.id, [first.order.id, second.order.id]));

    const publicCaller = appRouter.createCaller(await context());
    const publicContext = await publicCaller.ratings.public.get({ token: first.order.publicToken });
    expect(publicContext).toMatchObject({ eligible: true, rating: null, branch: { id: branchId, reviewUrl: "https://maps.google.com/?cid=12345" } });
    const fourStars = await publicCaller.ratings.public.submit({ token: first.order.publicToken, stars: 4, feedback: "الخدمة جيدة وأحتاج تواصل", contactBranchId: branchId });
    if (!fourStars.rating) throw new Error("Rating was not created");
    ratingIds.push(fourStars.rating.id);
    expect(fourStars).toMatchObject({ newlyCreated: true, rating: { stars: 4, contactBranchId: branchId, googleRedirectShown: false } });
    expect(fourStars.rating.contactRequestedAt).toEqual(expect.any(Number));
    const duplicate = await publicCaller.ratings.public.submit({ token: first.order.publicToken, stars: 5, feedback: "محاولة تكرار" });
    expect(duplicate).toMatchObject({ newlyCreated: false, rating: { stars: 4 } });

    const intruderCaller = appRouter.createCaller(await context({ customerId: intruder.order.customerId }));
    await expect(intruderCaller.ratings.customer.get({ orderId: first.order.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(intruderCaller.ratings.customer.submit({ orderId: first.order.id, stars: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const customerCaller = appRouter.createCaller(await context({ customerId: first.order.customerId }));
    const fiveStars = await customerCaller.ratings.customer.submit({ orderId: second.order.id, stars: 5, feedback: "كل شيء ممتاز" });
    if (!fiveStars.rating) throw new Error("Second rating was not created");
    ratingIds.push(fiveStars.rating.id);
    expect(fiveStars).toMatchObject({ newlyCreated: true, rating: { stars: 5, contactBranchId: null } });
    const marked = await customerCaller.ratings.customer.markGoogleShown({ orderId: second.order.id });
    expect(marked?.rating?.googleRedirectShown).toBe(true);

    const report = await owner.ratings.owner.list({ branchId });
    expect(report.count).toBe(2);
    expect(report.averageStars).toBe(4.5);
    expect(report.ratings.map(rating => rating.stars).sort()).toEqual([4, 5]);
  }, 45_000);
});
