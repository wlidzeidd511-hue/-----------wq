import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { auditLogs, customers, notificationMessages } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getCustomerById } from "./accountDb";
import { getDb, getServiceOrderById, purgeIntegrationTestOrders } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

const customerIds: number[] = [];
const proposalIds: number[] = [];

async function context(input: { owner?: boolean; customerId?: number } = {}): Promise<TrpcContext> {
  const settings = await getShopSettings();
  const customer = input.customerId ? await getCustomerById(input.customerId) : null;
  return {
    user: null,
    ownerSession: input.owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: input.owner ? await currentBranchSession(1) : null,
    portalSession: customer ? { kind: "customer", accountId: customer.id, sessionVersion: customer.sessionVersion } : null,
    req: { protocol: "https", headers: { "user-agent": "vitest-proposals" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  await purgeIntegrationTestOrders();
  if (proposalIds.length) await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "additional_repair_proposal"), inArray(auditLogs.entityId, proposalIds.splice(0).map(String))));
  if (customerIds.length) await db.delete(customers).where(inArray(customers.id, customerIds.splice(0)));
});

describe("Additional repair proposals", () => {
  it("lets the correct customer approve once, updates the invoice, and isolates another customer", async () => {
    const owner = appRouter.createCaller(await context({ owner: true }));
    const suffix = Date.now().toString().slice(-7);
    const first = await owner.orders.create({ branchId: 1, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت عرض عطل أول ${suffix}`, customerName: "عميل العرض الأول", customerPhone: `050${suffix}`, price: 10_000, cost: 2_000, estimatedTime: 60 });
    const second = await owner.orders.create({ branchId: 1, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت عرض عطل ثان ${suffix}`, customerName: "عميل العرض الثاني", customerPhone: `051${suffix}`, price: 20_000, cost: 4_000, estimatedTime: 60 });
    if (!first.order.customerId || !second.order.customerId) throw new Error("Customers were not created");
    customerIds.push(first.order.customerId, second.order.customerId);

    const proposal = await owner.proposals.owner.create({ orderId: first.order.id, issue: "مدخل الشاحن", description: "يحتاج تغيير القطعة", amount: 5_000 });
    const secondProposal = await owner.proposals.owner.create({ orderId: second.order.id, issue: "البطارية", amount: 3_000 });
    proposalIds.push(proposal.id, secondProposal.id);

    const publicCaller = appRouter.createCaller(await context());
    const publicList = await publicCaller.proposals.public.list({ token: first.publicToken });
    expect(publicList.find(item => item.id === proposal.id)).toMatchObject({ status: "pending", amount: 5_000, issue: "مدخل الشاحن" });
    await expect(publicCaller.proposals.public.respond({ token: second.publicToken, proposalId: proposal.id, decision: "approved" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const approved = await publicCaller.proposals.public.respond({ token: first.publicToken, proposalId: proposal.id, decision: "approved" });
    expect(approved).toMatchObject({ newlyResponded: true, proposal: { status: "approved" }, order: { price: 15_000 } });
    const duplicate = await publicCaller.proposals.public.respond({ token: first.publicToken, proposalId: proposal.id, decision: "approved" });
    expect(duplicate.newlyResponded).toBe(false);
    expect((await getServiceOrderById(first.order.id))?.price).toBe(15_000);

    const firstCustomer = appRouter.createCaller(await context({ customerId: first.order.customerId }));
    await expect(firstCustomer.proposals.customer.list({ orderId: second.order.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(firstCustomer.proposals.customer.respond({ proposalId: secondProposal.id, decision: "rejected" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const secondCustomer = appRouter.createCaller(await context({ customerId: second.order.customerId }));
    const rejected = await secondCustomer.proposals.customer.respond({ proposalId: secondProposal.id, decision: "rejected" });
    expect(rejected).toMatchObject({ newlyResponded: true, proposal: { status: "rejected" }, order: { price: 20_000 } });

    const delivered = await owner.orders.create({ branchId: 1, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت فاتورة مسلمة ${suffix}`, price: 9_000 });
    await owner.orders.updateStatus({ id: delivered.order.id, status: "delivered", visibleToCustomer: true });
    await expect(owner.proposals.owner.create({ orderId: delivered.order.id, issue: "زيادة بعد التسليم", amount: 1_000 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await getServiceOrderById(delivered.order.id))?.price).toBe(9_000);

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const messages = await db.select().from(notificationMessages).where(eq(notificationMessages.orderId, first.order.id));
    expect(messages.some(message => message.eventType === "additional_repair_proposed")).toBe(true);
    expect(messages.some(message => message.eventType === "additional_repair_approved")).toBe(true);
  }, 30_000);
});
