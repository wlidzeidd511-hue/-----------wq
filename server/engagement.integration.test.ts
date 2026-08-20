import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLogs, branchSettings, customers, directMessageReceipts, directMessages, popupCategorySettings, popupMessages, presenceSessions, serviceOrders } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb, purgeIntegrationTestOrders } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";

const createdMessageIds: number[] = [];
const createdPopupIds: number[] = [];
const createdSessionKeys: string[] = [];
const createdCustomerIds: number[] = [];

async function context(owner: boolean): Promise<TrpcContext> {
  const settings = await getShopSettings();
  const db = await getDb();
  const [branch] = db ? await db.select({ sessionVersion: branchSettings.sessionVersion }).from(branchSettings).where(eq(branchSettings.branchId, 1)).limit(1) : [];
  return {
    user: null,
    ownerSession: owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: owner ? { kind: "owner_branch", branchId: 1, sessionVersion: branch?.sessionVersion ?? 1 } : null,
    portalSession: null,
    req: { protocol: "https", headers: { "user-agent": "vitest-engagement" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  for (const id of createdMessageIds.splice(0)) {
    await db.delete(directMessageReceipts).where(eq(directMessageReceipts.messageId, id));
    await db.delete(directMessages).where(eq(directMessages.id, id));
    await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "direct_message"), eq(auditLogs.entityId, String(id))));
  }
  for (const id of createdPopupIds.splice(0)) {
    await db.delete(popupMessages).where(eq(popupMessages.id, id));
    await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "popup_message"), eq(auditLogs.entityId, String(id))));
  }
  for (const sessionKey of createdSessionKeys.splice(0)) {
    await db.delete(presenceSessions).where(eq(presenceSessions.sessionKey, sessionKey));
  }
  await purgeIntegrationTestOrders();
  for (const customerId of createdCustomerIds.splice(0)) await db.delete(customers).where(eq(customers.id, customerId));
});

describe("Engagement and popup management", () => {
  it("targets one anonymous visitor session and excludes another session", async () => {
    const ownerCaller = appRouter.createCaller(await context(true));
    const publicCaller = appRouter.createCaller(await context(false));
    const sessionKey = randomUUID().replaceAll("-", "");
    const otherSessionKey = randomUUID().replaceAll("-", "");
    const generalSessionKey = randomUUID().replaceAll("-", "");
    createdSessionKeys.push(sessionKey, generalSessionKey);
    const customerPhone = `050${Date.now().toString().slice(-7)}`;

    const order = await ownerCaller.orders.create({
      branchId: 1,
      serviceType: "maintenance",
      deviceInfo: `جهاز اختبار تكامل مؤقت رسائل ${Date.now()}`,
      customerName: "عميل اختبار الرسائل",
      customerPhone,
      price: 10_000,
      cost: 5_000,
      estimatedTime: 60,
    });
    const secondOrder = await ownerCaller.orders.create({
      branchId: 1,
      serviceType: "programming",
      deviceInfo: `جهاز اختبار تكامل مؤقت رسائل ثانٍ ${Date.now()}`,
      customerName: "عميل اختبار الرسائل",
      customerPhone,
      price: 8_000,
      cost: 3_000,
      estimatedTime: 45,
    });
    const unrelatedOrder = await ownerCaller.orders.create({
      branchId: 1,
      serviceType: "maintenance",
      deviceInfo: `جهاز عميل آخر مؤقت ${Date.now()}`,
      customerName: "عميل آخر",
      customerPhone: `051${Date.now().toString().slice(-7)}`,
      price: 7_000,
      cost: 2_000,
      estimatedTime: 30,
    });
    if (order.order.customerId) createdCustomerIds.push(order.order.customerId);
    if (unrelatedOrder.order.customerId) createdCustomerIds.push(unrelatedOrder.order.customerId);

    const customerInvoices = await ownerCaller.engagement.customerInvoices({ customerId: order.order.customerId! });
    expect(customerInvoices.map(invoice => invoice.id)).toEqual(expect.arrayContaining([order.order.id, secondOrder.order.id]));
    expect(customerInvoices.map(invoice => invoice.id)).not.toContain(unrelatedOrder.order.id);

    const heartbeatStartedAt = Date.now();
    await publicCaller.engagement.heartbeat({ sessionKey, currentPath: "/track?integration=1", branchId: 2, orderToken: order.publicToken });
    await publicCaller.engagement.heartbeat({ sessionKey: generalSessionKey, currentPath: "/", branchId: 1 });
    const online = await ownerCaller.engagement.online({ branchId: 1 });
    const identifiedVisitor = online.find(visitor => visitor.sessionKey === sessionKey);
    expect(identifiedVisitor).toMatchObject({
      branchId: 1,
      orderId: order.order.id,
      orderBarcode: order.order.barcode,
      deviceInfo: order.order.deviceInfo,
      customerName: "عميل اختبار الرسائل",
      customerKind: "known",
    });
    expect(identifiedVisitor?.lastSeenAt).toBeGreaterThanOrEqual(heartbeatStartedAt);
    expect(identifiedVisitor?.invoices.map(invoice => invoice.id)).toEqual(expect.arrayContaining([order.order.id, secondOrder.order.id]));
    expect(identifiedVisitor?.invoices).toHaveLength(2);
    expect(online.find(visitor => visitor.sessionKey === generalSessionKey)).toMatchObject({ customerKind: "general", invoices: [] });
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.update(serviceOrders).set({ status: "delivered", deliveredAt: Date.now() }).where(eq(serviceOrders.id, secondOrder.order.id));
    const activeOnly = (await ownerCaller.engagement.online({ branchId: 1 })).find(visitor => visitor.sessionKey === sessionKey);
    expect(activeOnly?.invoices.map(invoice => invoice.id)).toEqual([order.order.id]);
    await expect(publicCaller.engagement.online({ branchId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const sent = await ownerCaller.engagement.send({
      audience: "visitor",
      targetSessionKey: sessionKey,
      branchId: 1,
      title: "رسالة اختبار",
      body: "هذه الرسالة مخصصة لجلسة واحدة فقط",
      expiresInMinutes: 10,
    });
    createdMessageIds.push(sent.id);

    const sentLog = await ownerCaller.engagement.sent({ branchId: 1, limit: 10 });
    expect(sentLog.find(message => message.id === sent.id)).toMatchObject({
      orderId: order.order.id,
      orderBarcode: order.order.barcode,
      deviceInfo: order.order.deviceInfo,
      customerName: "عميل اختبار الرسائل",
    });

    const intendedInbox = await publicCaller.engagement.inbox({ afterId: Math.max(0, sent.id - 1), sessionKey, branchId: 1 });
    const otherInbox = await publicCaller.engagement.inbox({ afterId: Math.max(0, sent.id - 1), sessionKey: otherSessionKey, branchId: 1 });
    expect(intendedInbox.some(message => message.id === sent.id)).toBe(true);
    expect(otherInbox.some(message => message.id === sent.id)).toBe(false);

    const invoiceMessage = await ownerCaller.engagement.sendToOrder({
      orderId: order.order.id,
      title: `تحديث فاتورة #${order.order.barcode}`,
      body: "رسالة مرتبطة بهذه الفاتورة فقط",
      expiresInMinutes: 10,
    });
    createdMessageIds.push(invoiceMessage.id);
    const invoiceInbox = await publicCaller.engagement.inbox({
      afterId: Math.max(0, invoiceMessage.id - 1),
      orderToken: order.publicToken,
      sessionKey,
    });
    const secondInvoiceInbox = await publicCaller.engagement.inbox({
      afterId: Math.max(0, invoiceMessage.id - 1),
      orderToken: secondOrder.publicToken,
      sessionKey: otherSessionKey,
    });
    expect(invoiceInbox.some(message => message.id === invoiceMessage.id)).toBe(true);
    expect(secondInvoiceInbox.some(message => message.id === invoiceMessage.id)).toBe(false);
    await expect(publicCaller.engagement.acknowledgeMessage({
      messageId: invoiceMessage.id,
      orderToken: secondOrder.publicToken,
      sessionKey: otherSessionKey,
    })).resolves.toEqual({ success: false });
    await expect(publicCaller.engagement.acknowledgeMessage({
      messageId: invoiceMessage.id,
      orderToken: order.publicToken,
      sessionKey,
    })).resolves.toMatchObject({ success: true, seenAt: expect.any(Number) });
    const inboxAfterAcknowledgement = await publicCaller.engagement.inbox({
      afterId: Math.max(0, invoiceMessage.id - 1),
      orderToken: order.publicToken,
      sessionKey: randomUUID().replaceAll("-", ""),
    });
    expect(inboxAfterAcknowledgement.some(message => message.id === invoiceMessage.id)).toBe(false);
    await expect((ownerCaller.engagement.sendToOrder as any)({ title: "بدون فاتورة", body: "يجب الرفض", expiresInMinutes: 10 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(publicCaller.engagement.sendToOrder({ orderId: order.order.id, title: "ممنوع", body: "اختبار", expiresInMinutes: 10 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  }, 30_000);

  it("edits popup text, category, weight, branch, and active state", async () => {
    const ownerCaller = appRouter.createCaller(await context(true));
    const created = await ownerCaller.platform.popups.create({
      branchId: null,
      category: "in_repair",
      message: `رسالة مؤقتة ${Date.now()}`,
      weight: 1,
      isActive: true,
    });
    createdPopupIds.push(created);

    await ownerCaller.platform.popups.update({
      id: created,
      branchId: 1,
      category: "ready",
      message: "تم تحرير نص رسالة الاختبار",
      weight: 7,
      isActive: false,
    });
    const rows = await ownerCaller.platform.popups.list({ branchId: 1, includeInactive: true });
    const edited = rows.find(message => message.id === created);
    expect(edited).toMatchObject({
      branchId: 1,
      category: "ready",
      message: "تم تحرير نص رسالة الاختبار",
      weight: 7,
      isActive: false,
    });
  }, 15_000);

  it("disables a popup category for one branch or all branches before random selection", async () => {
    const ownerCaller = appRouter.createCaller(await context(true));
    const publicCaller = appRouter.createCaller(await context(false));
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const category = "before_rating" as const;
    const globalScope = `global:${category}`;
    const branchScope = `branch:1:${category}`;
    const [oldGlobal] = await db.select().from(popupCategorySettings).where(eq(popupCategorySettings.scopeKey, globalScope)).limit(1);
    const [oldBranch] = await db.select().from(popupCategorySettings).where(eq(popupCategorySettings.scopeKey, branchScope)).limit(1);
    const created = await ownerCaller.platform.popups.create({
      branchId: null,
      category,
      message: `رسالة فئة مؤقتة ${Date.now()}`,
      weight: 20,
      isActive: true,
    });
    createdPopupIds.push(created);
    try {
      await ownerCaller.platform.popups.setCategoryState({ branchId: 1, category, isActive: false });
      expect(await publicCaller.platform.popups.random({ branchId: 1, category })).toBeUndefined();
      expect(await publicCaller.platform.popups.random({ branchId: 2, category })).toBeDefined();

      await ownerCaller.platform.popups.setCategoryState({ branchId: 1, category, isActive: true });
      await ownerCaller.platform.popups.setCategoryState({ branchId: null, category, isActive: false });
      expect(await publicCaller.platform.popups.random({ branchId: 1, category })).toBeUndefined();
      expect(await publicCaller.platform.popups.random({ branchId: 2, category })).toBeDefined();
    } finally {
      if (oldGlobal) {
        await db.update(popupCategorySettings).set({ isActive: oldGlobal.isActive }).where(eq(popupCategorySettings.scopeKey, globalScope));
      } else {
        await db.delete(popupCategorySettings).where(eq(popupCategorySettings.scopeKey, globalScope));
      }
      if (oldBranch) {
        await db.update(popupCategorySettings).set({ isActive: oldBranch.isActive }).where(eq(popupCategorySettings.scopeKey, branchScope));
      } else {
        await db.delete(popupCategorySettings).where(eq(popupCategorySettings.scopeKey, branchScope));
      }
      await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "popup_category"), eq(auditLogs.entityId, globalScope)));
      await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "popup_category"), eq(auditLogs.entityId, branchScope)));
    }
  }, 20_000);
});
