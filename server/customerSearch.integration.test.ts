import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { branches, customers, serviceOrders } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
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
    req: { protocol: "https", headers: { "user-agent": "vitest-customer-search" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  if (createdBranchIds.length) {
    await db.delete(serviceOrders).where(inArray(serviceOrders.branchId, createdBranchIds));
    await db.delete(branches).where(inArray(branches.id, createdBranchIds));
    createdBranchIds.splice(0);
  }
  for (const customerId of createdCustomerIds.splice(0)) await db.delete(customers).where(eq(customers.id, customerId));
});

describe("owner customer search by phone", () => {
  it("returns invoices, warranties, and undelivered devices only from the unlocked branch", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const suffix = Date.now().toString(36);
    const firstInsert = await db.insert(branches).values({ slug: `customer-search-a-${suffix}`, code: `CSA${suffix}`, name: "فرع اختبار بحث العميل أ", sortOrder: 994 });
    const secondInsert = await db.insert(branches).values({ slug: `customer-search-b-${suffix}`, code: `CSB${suffix}`, name: "فرع اختبار بحث العميل ب", sortOrder: 995 });
    const firstBranchId = Number(firstInsert[0].insertId);
    const secondBranchId = Number(secondInsert[0].insertId);
    createdBranchIds.push(firstBranchId, secondBranchId);

    const phone = `966507${Date.now().toString().slice(-6)}`;
    const customerInsert = await db.insert(customers).values({ phoneNormalized: phone, phoneDisplay: `05${phone.slice(-8)}`, name: "عميل اختبار البحث", passwordHash: "test-hash", passwordSalt: "test-salt", isActive: true });
    const customerId = Number(customerInsert[0].insertId);
    createdCustomerIds.push(customerId);
    const now = Date.now();
    await db.insert(serviceOrders).values([
      { branchId: firstBranchId, customerId, barcode: `SEARCH-ACTIVE-${suffix}`, publicToken: randomUUID().replaceAll("-", ""), serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت بحث نشط ${suffix}`, status: "in_progress", customerName: "عميل اختبار البحث", customerPhone: phone, warrantyDays: 30 },
      { branchId: firstBranchId, customerId, barcode: `SEARCH-WARRANTY-${suffix}`, publicToken: randomUUID().replaceAll("-", ""), serviceType: "programming", deviceInfo: `جهاز اختبار تكامل مؤقت ضمان نشط ${suffix}`, status: "delivered", customerName: "عميل اختبار البحث", customerPhone: phone, warrantyDays: 30, deliveredAt: now - 86_400_000, warrantyExpiresAt: now + 20 * 86_400_000 },
      { branchId: secondBranchId, customerId, barcode: `SEARCH-OTHER-${suffix}`, publicToken: randomUUID().replaceAll("-", ""), serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت فرع آخر ${suffix}`, status: "ready", customerName: "عميل اختبار البحث", customerPhone: phone, warrantyDays: 30 },
    ]);

    const firstResult = await appRouter.createCaller(await ownerContext(firstBranchId)).accounts.customer.ownerSearchByPhone({ phone });
    expect(firstResult.customer?.name).toBe("عميل اختبار البحث");
    expect(firstResult.orders.map(order => order.barcode)).toEqual(expect.arrayContaining([`SEARCH-ACTIVE-${suffix}`, `SEARCH-WARRANTY-${suffix}`]));
    expect(firstResult.orders).toHaveLength(2);
    expect(firstResult.undeliveredOrders.map(order => order.barcode)).toEqual([`SEARCH-ACTIVE-${suffix}`]);
    expect(firstResult.totals).toEqual({ all: 2, undelivered: 1, activeWarranties: 1 });
    expect(firstResult.orders.find(order => order.barcode === `SEARCH-WARRANTY-${suffix}`)?.warrantyState).toBe("active");
    expect(firstResult.orders.some(order => order.branchId === secondBranchId)).toBe(false);

    const secondResult = await appRouter.createCaller(await ownerContext(secondBranchId)).accounts.customer.ownerSearchByPhone({ phone });
    expect(secondResult.orders.map(order => order.barcode)).toEqual([`SEARCH-OTHER-${suffix}`]);
    expect(secondResult.totals).toEqual({ all: 1, undelivered: 1, activeWarranties: 0 });
  }, 15_000);
});
