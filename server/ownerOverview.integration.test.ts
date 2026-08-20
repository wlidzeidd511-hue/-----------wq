import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { auditLogs, branches, customers, presenceSessions, serviceOrders, staffAccounts } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb, purgeIntegrationTestOrders } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";

const createdBranchIds: number[] = [];
const createdCustomerIds: number[] = [];

async function ownerContext(branchId: number): Promise<TrpcContext> {
  const settings = await getShopSettings();
  return {
    user: null,
    ownerSession: { kind: "owner", sessionVersion: settings.sessionVersion },
    branchSession: { branchId, sessionVersion: 1 },
    portalSession: null,
    req: { protocol: "https", headers: { "user-agent": "vitest-owner-overview" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  await purgeIntegrationTestOrders();
  if (!db) return;
  if (createdBranchIds.length) {
    await db.delete(presenceSessions).where(inArray(presenceSessions.branchId, createdBranchIds));
    await db.delete(staffAccounts).where(inArray(staffAccounts.branchId, createdBranchIds));
    await db.delete(auditLogs).where(inArray(auditLogs.branchId, createdBranchIds));
    await db.delete(branches).where(inArray(branches.id, createdBranchIds));
    createdBranchIds.splice(0);
  }
  for (const customerId of createdCustomerIds.splice(0)) await db.delete(customers).where(eq(customers.id, customerId));
});

describe("owner overview metrics", () => {
  it("counts completed maintenance, lifetime and online visitors, and accounts only in the unlocked branch", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const suffix = Date.now().toString(36);
    const firstInsert = await db.insert(branches).values({ slug: `metrics-a-${suffix}`, code: `MA${suffix}`, name: "فرع اختبار الإحصاءات أ", sortOrder: 990 });
    const secondInsert = await db.insert(branches).values({ slug: `metrics-b-${suffix}`, code: `MB${suffix}`, name: "فرع اختبار الإحصاءات ب", sortOrder: 991 });
    const firstBranchId = Number(firstInsert[0].insertId);
    const secondBranchId = Number(secondInsert[0].insertId);
    createdBranchIds.push(firstBranchId, secondBranchId);

    const firstCaller = appRouter.createCaller(await ownerContext(firstBranchId));
    const secondCaller = appRouter.createCaller(await ownerContext(secondBranchId));

    const firstPhone = `966501${Date.now().toString().slice(-6)}`;
    const secondPhone = `966502${Date.now().toString().slice(-6)}`;
    const firstCustomerInsert = await db.insert(customers).values({ phoneNormalized: firstPhone, phoneDisplay: firstPhone, name: "عميل إحصاءات أ", passwordHash: "test-hash", passwordSalt: "test-salt", isActive: true });
    const secondCustomerInsert = await db.insert(customers).values({ phoneNormalized: secondPhone, phoneDisplay: secondPhone, name: "عميل إحصاءات ب", passwordHash: "test-hash", passwordSalt: "test-salt", isActive: true });
    const firstCustomerId = Number(firstCustomerInsert[0].insertId);
    const secondCustomerId = Number(secondCustomerInsert[0].insertId);
    createdCustomerIds.push(firstCustomerId, secondCustomerId);

    await db.insert(serviceOrders).values([
      { branchId: firstBranchId, customerId: firstCustomerId, barcode: `METRICS-A-${suffix}`, publicToken: randomUUID().replaceAll("-", ""), serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت إحصاءات أ ${suffix}`, status: "delivered", customerName: "عميل إحصاءات أ", customerPhone: firstPhone },
      { branchId: secondBranchId, customerId: secondCustomerId, barcode: `METRICS-B-${suffix}`, publicToken: randomUUID().replaceAll("-", ""), serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت إحصاءات ب ${suffix}`, status: "delivered", customerName: "عميل إحصاءات ب", customerPhone: secondPhone },
    ]);
    await db.insert(staffAccounts).values([
      { branchId: firstBranchId, name: "موظف إحصاءات أ", username: `metrics_a_${suffix}`, permissions: JSON.stringify(["orders.view_branch"]), passwordHash: "test-hash", passwordSalt: "test-salt", isActive: true },
      { branchId: secondBranchId, name: "موظف إحصاءات ب", username: `metrics_b_${suffix}`, permissions: JSON.stringify(["orders.view_branch"]), passwordHash: "test-hash", passwordSalt: "test-salt", isActive: true },
    ]);

    const now = Date.now();
    await db.insert(presenceSessions).values([
      { sessionKey: randomUUID().replaceAll("-", ""), branchId: firstBranchId, currentPath: "/", displayLabel: "زائر أ نشط", lastSeenAt: now, createdAt: now - 60_000 },
      { sessionKey: randomUUID().replaceAll("-", ""), branchId: firstBranchId, currentPath: "/track", displayLabel: "زائر أ سابق", lastSeenAt: now - 600_000, createdAt: now - 900_000 },
      { sessionKey: randomUUID().replaceAll("-", ""), branchId: secondBranchId, currentPath: "/", displayLabel: "زائر ب نشط", lastSeenAt: now, createdAt: now - 30_000 },
    ]);

    await expect(firstCaller.ownerMetrics.overview()).resolves.toEqual({
      completedMaintenanceDevices: 1,
      lifetimeVisitors: 2,
      onlineVisitors: 1,
      customerAccounts: 1,
      activeStaffAccounts: 1,
      totalAccounts: 2,
    });
    await expect(secondCaller.ownerMetrics.overview()).resolves.toEqual({
      completedMaintenanceDevices: 1,
      lifetimeVisitors: 1,
      onlineVisitors: 1,
      customerAccounts: 1,
      activeStaffAccounts: 1,
      totalAccounts: 2,
    });
  }, 15_000);
});
