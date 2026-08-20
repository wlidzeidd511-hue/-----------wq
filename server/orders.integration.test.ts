import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLogs } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb, purgeIntegrationTestOrders } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

async function context(owner: boolean, branchId = 1): Promise<TrpcContext> {
  const settings = await getShopSettings();
  return {
    user: null,
    ownerSession: owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: owner ? await currentBranchSession(branchId) : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

beforeEach(async () => {
  await purgeIntegrationTestOrders();
});

afterEach(async () => {
  await purgeIntegrationTestOrders();
});

describe("Orders tRPC integration workflow", () => {
  it("creates a price approval request atomically and exposes it to the customer", async () => {
    const ownerCaller = appRouter.createCaller(await context(true));
    const publicCaller = appRouter.createCaller(await context(false));
    const customerPhone = `05${Date.now().toString().slice(-8)}`;

    const created = await ownerCaller.orders.create({
      serviceType: "maintenance",
      deviceInfo: `جهاز موافقة عند الإنشاء ${Date.now()}`,
      customerName: "عميل اختبار الموافقة",
      customerPhone,
      price: 7_500,
      requestPriceApproval: true,
    });

    await ownerCaller.orders.uploadPhoto({
      orderId: created.order.id,
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      caption: "قبل الصيانة 1",
      visibleToCustomer: false,
    });

    const bundle = await ownerCaller.orders.getById({ id: created.order.id });
    expect(bundle?.order.status).toBe("awaiting_approval");
    expect(bundle?.order.priceApprovalStatus).toBe("pending");
    expect(bundle?.order.approvalRequestedAt).toBeGreaterThan(0);
    expect(bundle?.history.some(event => event.toStatus === "awaiting_approval")).toBe(true);
    expect(bundle?.notifications.filter(message => message.eventType === "price_approval_requested")).toHaveLength(1);
    expect(bundle?.photos.some(photo => photo.caption === "قبل الصيانة 1" && !photo.visibleToCustomer)).toBe(true);

    const tracked = await publicCaller.orders.track({ token: created.publicToken });
    expect(tracked?.order.priceApprovalStatus).toBe("pending");
    expect(tracked?.order.price).toBe(7_500);

    await expect(ownerCaller.orders.create({
      serviceType: "maintenance",
      deviceInfo: "جهاز بلا جوال",
      price: 5_000,
      requestPriceApproval: true,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }, 30_000);

  it("completes approvals, status updates, archive restore, and invoice data", async () => {
    const ownerCaller = appRouter.createCaller(await context(true));
    const publicCaller = appRouter.createCaller(await context(false));

    const created = await ownerCaller.orders.create({
      serviceType: "maintenance",
      deviceInfo: `جهاز اختبار تكامل مؤقت ${Date.now()}`,
      price: 50_000,
      cost: 20_000,
      amountPaid: 10_000,
      estimatedTime: 60,
      warrantyDays: 30,
    });
    await ownerCaller.orders.updateDetails({
      id: created.order.id,
      price: 55_000,
      requestPriceApproval: true,
    });
    const pendingApproval = await ownerCaller.orders.getById({ id: created.order.id });
    expect(pendingApproval?.order.status).toBe("awaiting_approval");
    expect(pendingApproval?.order.priceApprovalStatus).toBe("pending");

    const approved = await publicCaller.orders.respondApproval({
      token: created.publicToken,
      decision: "approved",
    });
    expect(approved?.order.status).toBe("in_progress");
    expect(approved?.order.priceApprovalStatus).toBe("approved");

    await ownerCaller.orders.updateDetails({
      id: created.order.id,
      requestPriceApproval: true,
    });
    const rejected = await publicCaller.orders.respondApproval({
      token: created.publicToken,
      decision: "rejected",
    });
    expect(rejected?.order.status).toBe("cancelled");
    expect(rejected?.order.priceApprovalStatus).toBe("rejected");

    const ready = await ownerCaller.orders.updateStatus({
      id: created.order.id,
      status: "ready",
      note: "جاهز ضمن اختبار التكامل",
      visibleToCustomer: true,
    });
    expect(ready?.status).toBe("ready");

    await ownerCaller.orders.archive({ id: created.order.id, archived: true });
    const archived = await ownerCaller.orders.getAll({ archived: true });
    expect(archived.some(order => order.id === created.order.id)).toBe(true);

    await ownerCaller.orders.archive({ id: created.order.id, archived: false });
    const active = await ownerCaller.orders.getAll({ archived: false });
    expect(active.some(order => order.id === created.order.id)).toBe(true);

    expect(created.order.barcode).toMatch(/^\d+$/);

    const invoice = await publicCaller.orders.getInvoice({ token: created.publicToken });
    expect(invoice?.order.publicToken).toBe(created.publicToken);
    expect(invoice?.order.barcode).toBe(created.order.barcode);
    expect(invoice?.totals).toEqual({ total: 55_000, paid: 10_000, remaining: 45_000 });
    expect(invoice?.settings.shopName).toBeTruthy();

    const history = (await ownerCaller.orders.getById({ id: created.order.id }))?.history ?? [];
    expect(history.some(event => event.note === "وافق الزبون على السعر")).toBe(true);
    expect(history.some(event => event.note === "رفض الزبون السعر")).toBe(true);
    expect(history.some(event => event.toStatus === "ready")).toBe(true);
  }, 30_000);

  it("protects newer invoice fields from an outdated owner save", async () => {
    const owner = appRouter.createCaller(await context(true));
    const created = await owner.orders.create({
      serviceType: "maintenance",
      deviceInfo: `جهاز اختبار تكامل مؤقت تعارض ${Date.now()}`,
      internalNotes: "الملاحظة الأصلية",
    });
    const originalVersion = new Date(created.order.updatedAt).getTime();
    await new Promise(resolve => setTimeout(resolve, 1_100));
    const firstSave = await owner.orders.updateDetails({
      id: created.order.id,
      internalNotes: "الملاحظة الأحدث المحفوظة",
      deviceLocation: "الرف الثاني",
      expectedUpdatedAt: originalVersion,
    });
    expect(firstSave?.internalNotes).toBe("الملاحظة الأحدث المحفوظة");

    await expect(owner.orders.updateDetails({
      id: created.order.id,
      internalNotes: "نسخة قديمة لا يجب حفظها",
      expectedUpdatedAt: originalVersion,
    })).rejects.toMatchObject({ code: "CONFLICT" });
    const stored = await owner.orders.getById({ id: created.order.id });
    expect(stored?.order).toMatchObject({ internalNotes: "الملاحظة الأحدث المحفوظة", deviceLocation: "الرف الثاني" });
  }, 30_000);

  it("persists every intake, device, financial, warranty, duration, and notes field", async () => {
    const owner = appRouter.createCaller(await context(true));
    const created = await owner.orders.create({
      serviceType: "maintenance",
      customerName: "عميل حفظ الحقول",
      deviceInfo: `جهاز اختبار تكامل مؤقت حفظ الحقول ${Date.now()}`,
      deviceBrand: "Apple",
      deviceModel: "iPhone 15",
      serialNumber: "SERIAL-TEST-15",
      intakeCondition: "خدش يسار الجهاز",
      receivedAccessories: "شاحن وغطاء",
      reportedIssue: "الشاشة لا تعمل",
      customerVisibleNotes: "سيتم التواصل بعد الفحص",
      internalNotes: "يفحصه الفني ياسر",
      deviceLocation: "الرف الأول",
      price: 42_000,
      cost: 18_000,
      amountPaid: 10_000,
      estimatedTime: 180,
      warrantyDays: 365,
    });
    expect((await owner.orders.getById({ id: created.order.id }))?.order).toMatchObject({
      customerName: "عميل حفظ الحقول",
      deviceBrand: "Apple",
      deviceModel: "iPhone 15",
      serialNumber: "SERIAL-TEST-15",
      intakeCondition: "خدش يسار الجهاز",
      receivedAccessories: "شاحن وغطاء",
      reportedIssue: "الشاشة لا تعمل",
      customerVisibleNotes: "سيتم التواصل بعد الفحص",
      internalNotes: "يفحصه الفني ياسر",
      deviceLocation: "الرف الأول",
      price: 42_000,
      cost: 18_000,
      amountPaid: 10_000,
      warrantyDays: 365,
    });

    const version = new Date(created.order.updatedAt).getTime();
    await new Promise(resolve => setTimeout(resolve, 1_100));
    await owner.orders.updateDetails({
      id: created.order.id,
      customerName: "عميل حفظ الحقول بعد التعديل",
      deviceInfo: `${created.order.deviceInfo} معدل`,
      deviceBrand: "Samsung",
      deviceModel: "S24",
      serialNumber: "SERIAL-UPDATED-24",
      intakeCondition: "الحالة محفوظة بعد التعديل",
      receivedAccessories: "الجهاز فقط",
      reportedIssue: "عطل شحن",
      customerVisibleNotes: "تم تحديث ملاحظة العميل",
      internalNotes: "تم تحديث ملاحظة المالك",
      deviceLocation: "عند الفني إبراهيم",
      price: 50_000,
      cost: 20_000,
      amountPaid: 15_000,
      estimatedTime: 240,
      warrantyDays: 730,
      expectedUpdatedAt: version,
    });
    expect((await owner.orders.getById({ id: created.order.id }))?.order).toMatchObject({
      customerName: "عميل حفظ الحقول بعد التعديل",
      deviceBrand: "Samsung",
      deviceModel: "S24",
      serialNumber: "SERIAL-UPDATED-24",
      intakeCondition: "الحالة محفوظة بعد التعديل",
      receivedAccessories: "الجهاز فقط",
      reportedIssue: "عطل شحن",
      customerVisibleNotes: "تم تحديث ملاحظة العميل",
      internalNotes: "تم تحديث ملاحظة المالك",
      deviceLocation: "عند الفني إبراهيم",
      price: 50_000,
      cost: 20_000,
      amountPaid: 15_000,
      warrantyDays: 730,
    });
  }, 30_000);

  it("opens an archived invoice with its secret token while keeping it hidden from public tracking", async () => {
    const owner = appRouter.createCaller(await context(true));
    const publicCaller = appRouter.createCaller(await context(false));
    const created = await owner.orders.create({
      serviceType: "maintenance",
      deviceInfo: `جهاز اختبار تكامل مؤقت فاتورة قديمة ${Date.now()}`,
      customerName: "عميل فاتورة تاريخية",
      price: 12_300,
      amountPaid: 2_300,
    });
    await owner.orders.archive({ id: created.order.id, archived: true });

    const invoice = await publicCaller.orders.getInvoice({ token: created.publicToken });
    expect(invoice?.order).toMatchObject({ id: created.order.id, publicToken: created.publicToken, price: 12_300, amountPaid: 2_300 });
    await expect(publicCaller.orders.track({ token: created.publicToken })).resolves.toBeUndefined();
  }, 30_000);

  it("archives and restores a selected group without deleting data or crossing branches", async () => {
    const ownerOne = appRouter.createCaller(await context(true, 1));
    const ownerTwo = appRouter.createCaller(await context(true, 2));
    const first = await ownerOne.orders.create({ serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت مجموعة 1 ${Date.now()}` });
    const second = await ownerOne.orders.create({ serviceType: "programming", deviceInfo: `جهاز اختبار تكامل مؤقت مجموعة 2 ${Date.now()}` });
    const otherBranch = await ownerTwo.orders.create({ branchId: 2, serviceType: "maintenance", deviceInfo: `جهاز اختبار تكامل مؤقت فرع آخر ${Date.now()}` });

    const archived = await ownerOne.orders.archiveMany({ ids: [first.order.id, second.order.id], archived: true });
    expect(archived.count).toBe(2);
    const archivedRows = await ownerOne.orders.getAll({ archived: true });
    expect(archivedRows.filter(order => [first.order.id, second.order.id].includes(order.id))).toHaveLength(2);
    await expect(ownerOne.orders.archiveMany({ ids: [first.order.id, otherBranch.order.id], archived: true })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const restored = await ownerOne.orders.archiveMany({ ids: [first.order.id, second.order.id], archived: false });
    expect(restored.count).toBe(2);
    const activeRows = await ownerOne.orders.getAll({ archived: false });
    expect(activeRows.filter(order => [first.order.id, second.order.id].includes(order.id))).toHaveLength(2);
    const history = (await ownerOne.orders.getById({ id: first.order.id }))?.history ?? [];
    expect(history.some(event => event.note === "تمت أرشفة الطلب ضمن مجموعة")).toBe(true);
    expect(history.some(event => event.note === "تمت استعادة الطلب ضمن مجموعة")).toBe(true);

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "orders.bulk_restored"), eq(auditLogs.branchId, 1))).limit(1);
    expect(audit).toBeTruthy();
  }, 30_000);
});
