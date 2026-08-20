import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { branches, orderStatusHistory, serviceOrders } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDashboardReport, getDb, purgeIntegrationTestOrders } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";

const branchIds: number[] = [];

async function ownerContext(branchId: number): Promise<TrpcContext> {
  const settings = await getShopSettings();
  return {
    user: null,
    ownerSession: { kind: "owner", sessionVersion: settings.sessionVersion },
    branchSession: { kind: "owner_branch", branchId, sessionVersion: 1 },
    portalSession: null,
    req: { protocol: "https", headers: { "user-agent": "vitest-dashboard-metrics" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  await purgeIntegrationTestOrders();
  for (const id of branchIds.splice(0)) await db.delete(branches).where(eq(branches.id, id));
});

describe("Owner operational metrics", () => {
  it("calculates the most common fault and accurate completion, invoice, and waiting averages", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const suffix = Date.now().toString().slice(-8);
    const insertedBranch = await db.insert(branches).values({
      name: `فرع اختبار المؤشرات ${suffix}`,
      slug: `metrics-${suffix}`,
      code: `M${suffix}`,
      isActive: true,
    });
    const branchId = Number(insertedBranch[0].insertId);
    branchIds.push(branchId);
    const caller = appRouter.createCaller(await ownerContext(branchId));
    const first = await caller.orders.create({ branchId, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت مؤشرات 1 ${suffix}`, reportedIssue: "شاشة مكسورة", price: 10_000, cost: 0, estimatedTime: 60 });
    const second = await caller.orders.create({ branchId, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت مؤشرات 2 ${suffix}`, reportedIssue: "شاشة مكسورة", price: 20_000, cost: 0, estimatedTime: 60 });
    const third = await caller.orders.create({ branchId, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت مؤشرات 3 ${suffix}`, reportedIssue: "مدخل شاحن", price: 30_000, cost: 0, estimatedTime: 60 });
    const now = Date.now();
    const firstReceived = now - 10 * 60 * 60 * 1000;
    const secondReceived = now - 8 * 60 * 60 * 1000;
    const thirdReceived = now - 3 * 60 * 60 * 1000;
    await db.update(serviceOrders).set({ status: "delivered", createdAt: new Date(firstReceived), deliveredAt: firstReceived + 8 * 60 * 60 * 1000 }).where(eq(serviceOrders.id, first.order.id));
    await db.update(serviceOrders).set({ status: "delivered", createdAt: new Date(secondReceived), deliveredAt: secondReceived + 4 * 60 * 60 * 1000 }).where(eq(serviceOrders.id, second.order.id));
    await db.update(serviceOrders).set({ createdAt: new Date(thirdReceived) }).where(eq(serviceOrders.id, third.order.id));
    await db.insert(orderStatusHistory).values([
      { orderId: first.order.id, fromStatus: "diagnosing", toStatus: "in_progress", visibleToCustomer: true, changedBy: "اختبار", changedByType: "system", createdAt: firstReceived + 60 * 60 * 1000 },
      { orderId: second.order.id, fromStatus: "diagnosing", toStatus: "in_progress", visibleToCustomer: true, changedBy: "اختبار", changedByType: "system", createdAt: secondReceived + 2 * 60 * 60 * 1000 },
    ]);

    const report = await getDashboardReport(branchId);
    expect(report.mostCommonFault).toEqual({ label: "شاشة مكسورة", count: 2 });
    expect(report.averageInvoiceValue).toBe(20_000);
    expect(Math.abs(report.averageCompletionMs - 6 * 60 * 60 * 1000)).toBeLessThan(1_000);
    expect(Math.abs(report.averageWaitBeforeWorkMs - 90 * 60 * 1000)).toBeLessThan(1_000);
    expect(report.completionSampleSize).toBe(2);
    expect(report.waitSampleSize).toBe(2);

    const ownerReport = await caller.orders.report({ branchId });
    expect(ownerReport.mostCommonFault).toEqual({ label: "شاشة مكسورة", count: 2 });
    expect(Math.abs(ownerReport.averageCompletionMs - 6 * 60 * 60 * 1000)).toBeLessThan(1_000);
    expect(Math.abs(ownerReport.averageWaitBeforeWorkMs - 90 * 60 * 1000)).toBeLessThan(1_000);
  }, 30_000);
});
