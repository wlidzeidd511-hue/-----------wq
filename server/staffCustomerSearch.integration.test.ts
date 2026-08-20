import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLogs, customers, staffAccounts, staffBranchAssignments } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import type { PortalSessionPayload } from "./accountAuth";
import { getDb, purgeServiceOrdersForTests } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

const orderIds: number[] = [];
const staffIds: number[] = [];
const customerIds: number[] = [];

async function context(owner = false, branchId = 1, portalSession: PortalSessionPayload | null = null): Promise<TrpcContext> {
  const settings = await getShopSettings();
  return {
    user: null,
    ownerSession: owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: owner ? await currentBranchSession(branchId) : null,
    portalSession,
    req: { protocol: "https", headers: { "user-agent": "vitest-staff-customer-search" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  await purgeServiceOrdersForTests(orderIds.splice(0));
  const db = await getDb();
  if (!db) return;
  for (const id of staffIds.splice(0).reverse()) {
    await db.delete(staffBranchAssignments).where(eq(staffBranchAssignments.staffId, id));
    await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "staff"), eq(auditLogs.entityId, String(id))));
    await db.delete(staffAccounts).where(eq(staffAccounts.id, id));
  }
  for (const id of customerIds.splice(0).reverse()) await db.delete(customers).where(eq(customers.id, id));
});

describe("staff customer phone search", () => {
  it("returns only the customer's invoices in the staff branch and hides a customer from another branch", async () => {
    const ownerOne = appRouter.createCaller(await context(true, 1));
    const ownerTwo = appRouter.createCaller(await context(true, 2));
    const publicCaller = appRouter.createCaller(await context(false));
    const suffix = Date.now().toString().slice(-7);
    const sharedPhone = `055${suffix}`;
    const otherOnlyPhone = `054${suffix}`;

    const staffCreated = await ownerOne.accounts.staff.create({
      branchId: 1,
      name: "موظف بحث العميل",
      username: `staff-search-${Date.now()}`,
      permissions: ["orders.view_branch", "orders.update_intake", "customers.view"],
    });
    if (!staffCreated.staff) throw new Error("Staff setup failed");
    staffIds.push(staffCreated.staff.id);
    const login = await publicCaller.accounts.staff.login({ username: staffCreated.staff.username, password: staffCreated.temporaryPassword });
    const staffCaller = appRouter.createCaller(await context(false, 1, {
      kind: "staff",
      accountId: login.staff.id,
      branchId: login.staff.branchId,
      sessionVersion: login.staff.sessionVersion,
    }));

    const branchOneOrder = await ownerOne.orders.create({ serviceType: "maintenance", deviceInfo: `جهاز بحث الموظف فرع 1 ${Date.now()}`, customerName: "عميل مشترك", customerPhone: sharedPhone });
    const branchTwoOrder = await ownerTwo.orders.create({ branchId: 2, serviceType: "maintenance", deviceInfo: `جهاز بحث الموظف فرع 2 ${Date.now()}`, customerName: "عميل مشترك", customerPhone: sharedPhone });
    const otherOnlyOrder = await ownerTwo.orders.create({ branchId: 2, serviceType: "programming", deviceInfo: `جهاز عميل فرع آخر فقط ${Date.now()}`, customerName: "عميل فرع ثان", customerPhone: otherOnlyPhone });
    orderIds.push(branchOneOrder.order.id, branchTwoOrder.order.id, otherOnlyOrder.order.id);
    for (const id of [branchOneOrder.order.customerId, otherOnlyOrder.order.customerId]) if (id && !customerIds.includes(id)) customerIds.push(id);

    const found = await staffCaller.staff.customers.searchByPhone({ phone: sharedPhone });
    expect(found.customer?.name).toBe("عميل مشترك");
    expect(found.orders.map(order => order.id)).toEqual([branchOneOrder.order.id]);
    expect(found.orders.every(order => !order.archived)).toBe(true);

    await expect(staffCaller.staff.customers.searchByPhone({ phone: otherOnlyPhone })).resolves.toEqual({ customer: null, orders: [] });

    const staffVersion = new Date((await staffCaller.staff.orders.get({ id: branchOneOrder.order.id })).order.updatedAt).getTime();
    await new Promise(resolve => setTimeout(resolve, 1_100));
    await ownerOne.orders.updateDetails({
      id: branchOneOrder.order.id,
      customerVisibleNotes: "ملاحظة أحدث من المالك",
      deviceLocation: "الرف الثالث",
      expectedUpdatedAt: staffVersion,
    });
    await expect(staffCaller.staff.orders.updateIntake({
      id: branchOneOrder.order.id,
      customerVisibleNotes: "نسخة موظف قديمة",
      expectedUpdatedAt: staffVersion,
    })).rejects.toMatchObject({ code: "CONFLICT" });
    const latest = await ownerOne.orders.getById({ id: branchOneOrder.order.id });
    expect(latest?.order).toMatchObject({ customerVisibleNotes: "ملاحظة أحدث من المالك", deviceLocation: "الرف الثالث" });
  }, 30_000);
});
