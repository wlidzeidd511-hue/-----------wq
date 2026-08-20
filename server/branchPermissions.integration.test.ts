import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  branchSettings,
  branches,
  customers,
  internalAlerts,
  notificationMessages,
  staffAccounts,
  staffBranchAssignments,
  whatsappTemplates,
} from "../drizzle/schema";
import type { PortalSessionPayload } from "./accountAuth";
import type { TrpcContext } from "./_core/context";
import { createServiceOrder, getDb, purgeServiceOrderForTests } from "./db";
import { queueWhatsAppNotification, type WhatsAppEvent } from "./notifications";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

const createdOrderIds: number[] = [];
const createdCustomerIds: number[] = [];
const createdStaffIds: number[] = [];
const createdBranchIds: number[] = [];
const createdAlertIds: number[] = [];

async function testContext(input: { owner?: boolean; ownerBranchId?: number; portalSession?: PortalSessionPayload | null } = {}): Promise<TrpcContext> {
  const settings = await getShopSettings();
  return {
    user: null,
    ownerSession: input.owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: input.owner ? await currentBranchSession(input.ownerBranchId ?? 1) : null,
    portalSession: input.portalSession ?? null,
    req: {
      protocol: "https",
      headers: { "user-agent": "vitest-branch-permissions", "x-forwarded-for": "127.0.0.88" },
      socket: { remoteAddress: "127.0.0.88" },
    } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  const alertIds = createdAlertIds.splice(0);
  if (alertIds.length) await db.delete(internalAlerts).where(inArray(internalAlerts.id, alertIds));
  for (const id of createdOrderIds.splice(0).reverse()) {
    await purgeServiceOrderForTests(id);
    await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "service_order"), eq(auditLogs.entityId, String(id))));
  }
  for (const id of createdCustomerIds.splice(0).reverse()) {
    await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "customer"), eq(auditLogs.entityId, String(id))));
    await db.delete(customers).where(eq(customers.id, id));
  }
  for (const id of createdStaffIds.splice(0).reverse()) {
    await db.delete(staffBranchAssignments).where(eq(staffBranchAssignments.staffId, id));
    await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "staff"), eq(auditLogs.entityId, String(id))));
    await db.delete(staffAccounts).where(eq(staffAccounts.id, id));
  }
  for (const id of createdBranchIds.splice(0).reverse()) {
    await db.delete(whatsappTemplates).where(eq(whatsappTemplates.branchId, id));
    await db.delete(branchSettings).where(eq(branchSettings.branchId, id));
    await db.delete(branches).where(eq(branches.id, id));
  }
});

describe("branch isolation, staff permissions, and immutable actor records", () => {
  it("isolates staff and customer data while recording receiver, photographer, and status actor", async () => {
    const ownerCaller = appRouter.createCaller(await testContext({ owner: true, ownerBranchId: 1 }));
    const secondOwnerCaller = appRouter.createCaller(await testContext({ owner: true, ownerBranchId: 2 }));
    const publicCaller = appRouter.createCaller(await testContext());
    const suffix = `${Date.now()}-${randomUUID().slice(0, 6)}`;
    const full = await ownerCaller.accounts.staff.create({
      branchId: 1,
      name: "موظف اختبار الصلاحيات",
      username: `vitest-full-${suffix}`,
      permissions: ["orders.view_branch", "orders.create", "orders.update_intake", "orders.update_status", "orders.view_prices", "orders.view_internal_notes", "customers.view", "customers.create", "photos.upload", "photos.view"],
    });
    const limited = await ownerCaller.accounts.staff.create({
      branchId: 1,
      name: "موظف اختبار محدود",
      username: `vitest-limited-${suffix}`,
      permissions: ["orders.view_branch"],
    });
    const otherBranch = await secondOwnerCaller.accounts.staff.create({
      branchId: 2,
      name: "موظف اختبار فرع آخر",
      username: `vitest-other-${suffix}`,
      permissions: ["orders.view_branch"],
    });
    if (!full.staff || !limited.staff || !otherBranch.staff) throw new Error("Staff setup failed");
    createdStaffIds.push(full.staff.id, limited.staff.id, otherBranch.staff.id);

    const fullCaller = appRouter.createCaller(await testContext({ portalSession: {
      kind: "staff", accountId: full.staff.id, branchId: 1, sessionVersion: full.staff.sessionVersion,
    } }));
    const limitedCaller = appRouter.createCaller(await testContext({ portalSession: {
      kind: "staff", accountId: limited.staff.id, branchId: 1, sessionVersion: limited.staff.sessionVersion,
    } }));
    const otherCaller = appRouter.createCaller(await testContext({ portalSession: {
      kind: "staff", accountId: otherBranch.staff.id, branchId: 2, sessionVersion: otherBranch.staff.sessionVersion,
    } }));

    const staffOrderResult = await fullCaller.staff.orders.create({
      serviceType: "maintenance",
      deviceInfo: `جهاز اختبار تكامل مؤقت صلاحيات ${suffix}`,
      reportedIssue: "شاشة مكسورة",
      customerName: "عميل اختبار الفرع الأول",
      customerPhone: `05${Date.now().toString().slice(-8)}`,
      deviceLocation: "رف الاستلام",
      price: 25_000,
      amountPaid: 5_000,
      estimatedTime: 90,
      warrantyDays: 30,
      requestPriceApproval: true,
    });
    createdOrderIds.push(staffOrderResult.order.id);
    if (staffOrderResult.order.customerId) createdCustomerIds.push(staffOrderResult.order.customerId);
    expect(staffOrderResult.order.status).toBe("awaiting_approval");
    expect(staffOrderResult.order.priceApprovalStatus).toBe("pending");

    const ownerOrderResult = await secondOwnerCaller.orders.create({
      branchId: 2,
      serviceType: "programming",
      deviceInfo: `جهاز اختبار تكامل مؤقت فرع ثان ${suffix}`,
      customerName: "عميل اختبار الفرع الثاني",
      customerPhone: `05${(Date.now() + 1).toString().slice(-8)}`,
      price: 18_000,
      cost: 4_000,
      internalNotes: "ملاحظة داخلية لا تظهر للعميل",
      deviceLocation: "خزانة الفرع الثاني",
    });
    createdOrderIds.push(ownerOrderResult.order.id);
    if (ownerOrderResult.order.customerId) createdCustomerIds.push(ownerOrderResult.order.customerId);

    const firstBranchList = await fullCaller.staff.orders.list();
    const secondBranchList = await otherCaller.staff.orders.list();
    expect(firstBranchList.some(order => order.id === staffOrderResult.order.id)).toBe(true);
    expect(firstBranchList.some(order => order.id === ownerOrderResult.order.id)).toBe(false);
    expect(secondBranchList.some(order => order.id === ownerOrderResult.order.id)).toBe(true);
    expect(secondBranchList.some(order => order.id === staffOrderResult.order.id)).toBe(false);
    expect(firstBranchList[0]).toHaveProperty("cost", 0);
    expect(secondBranchList[0]).not.toHaveProperty("cost");
    expect(firstBranchList[0]).toHaveProperty("internalNotes");
    await expect(otherCaller.staff.orders.get({ id: staffOrderResult.order.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const forbiddenOrderInput = {
      serviceType: "maintenance" as const,
      deviceInfo: `جهاز اختبار تكامل مؤقت ممنوع ${suffix}`,
      customerName: "عميل ممنوع",
      customerPhone: `05${(Date.now() + 2).toString().slice(-8)}`,
      price: 0,
      amountPaid: 0,
      estimatedTime: 0,
      warrantyDays: 30,
    };
    await expect(limitedCaller.staff.orders.create(forbiddenOrderInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(limitedCaller.staff.orders.updateIntake({ id: staffOrderResult.order.id, intakeCondition: "محاولة ممنوعة" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(limitedCaller.staff.orders.uploadPhoto({
      orderId: staffOrderResult.order.id,
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      visibleToCustomer: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const grantedStaff = await ownerCaller.accounts.staff.update({
      id: limited.staff.id,
      permissions: ["orders.view_branch", "orders.create", "customers.create"],
    });
    expect(grantedStaff?.sessionVersion).toBe(limited.staff.sessionVersion + 1);
    await expect(limitedCaller.staff.orders.list()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "STAFF_SESSION_EXPIRED" });
    const grantedCaller = appRouter.createCaller(await testContext({ portalSession: {
      kind: "staff", accountId: limited.staff.id, branchId: 1, sessionVersion: grantedStaff!.sessionVersion,
    } }));
    const newlyAllowed = await grantedCaller.staff.orders.create({
      ...forbiddenOrderInput,
      deviceInfo: `جهاز اختبار تفعيل صلاحية قائم ${suffix}`,
      customerName: "عميل بعد تفعيل الصلاحية",
      customerPhone: `05${(Date.now() + 3).toString().slice(-8)}`,
    });
    createdOrderIds.push(newlyAllowed.order.id);
    if (newlyAllowed.order.customerId) createdCustomerIds.push(newlyAllowed.order.customerId);
    expect(newlyAllowed.order.createdByStaffId).toBe(limited.staff.id);

    const revokedStaff = await ownerCaller.accounts.staff.update({ id: limited.staff.id, permissions: ["orders.view_branch"] });
    expect(revokedStaff?.sessionVersion).toBe(grantedStaff!.sessionVersion + 1);
    await expect(grantedCaller.staff.orders.list()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "STAFF_SESSION_EXPIRED" });
    const revokedCaller = appRouter.createCaller(await testContext({ portalSession: {
      kind: "staff", accountId: limited.staff.id, branchId: 1, sessionVersion: revokedStaff!.sessionVersion,
    } }));
    await expect(revokedCaller.staff.orders.create({
      ...forbiddenOrderInput,
      deviceInfo: `جهاز اختبار سحب صلاحية قائم ${suffix}`,
      customerPhone: `05${(Date.now() + 4).toString().slice(-8)}`,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fullCaller.orders.getAll()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await fullCaller.staff.orders.updateIntake({
      id: staffOrderResult.order.id,
      intakeCondition: "خدش بسيط موثق",
      deviceLocation: "رف الفني 3",
    });
    const photoList = await fullCaller.staff.orders.uploadPhoto({
      orderId: staffOrderResult.order.id,
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      caption: "صورة اختبار هوية الرافع",
      visibleToCustomer: true,
    });
    expect(photoList.find(photo => photo.caption === "صورة اختبار هوية الرافع")?.uploadedByStaffId).toBe(full.staff.id);
    await ownerCaller.orders.updateStatus({ id: staffOrderResult.order.id, status: "ready", note: "جاهز ضمن اختبار الهوية", visibleToCustomer: true });

    const ownerBundle = await ownerCaller.orders.getById({ id: staffOrderResult.order.id });
    expect(ownerBundle?.order).toMatchObject({
      createdByStaffId: full.staff.id,
      receivedByStaffId: full.staff.id,
      lastUpdatedByStaffId: full.staff.id,
      deviceLocationUpdatedByStaffId: full.staff.id,
      deviceLocation: "رف الفني 3",
    });
    expect(ownerBundle?.photos.find(photo => photo.caption === "صورة اختبار هوية الرافع")?.uploadedBy?.id).toBe(full.staff.id);
    expect(ownerBundle?.history.find(item => item.toStatus === "awaiting_approval")).toMatchObject({ changedByType: "staff", changedById: full.staff.id });
    expect(ownerBundle?.history.find(item => item.toStatus === "ready")).toMatchObject({ changedByType: "owner", changedById: null });

    const publicBundle = await publicCaller.orders.track({ token: staffOrderResult.order.publicToken });
    expect(publicBundle?.order).not.toHaveProperty("deviceLocation");
    expect(publicBundle?.order).not.toHaveProperty("cost");
    expect(publicBundle?.order).not.toHaveProperty("internalNotes");
    expect(publicBundle?.order).not.toHaveProperty("customerPhone");
    await expect(publicCaller.platform.audit({ limit: 10 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    if (!staffOrderResult.order.customerId) throw new Error("Customer setup failed");
    const customerCaller = appRouter.createCaller(await testContext({ portalSession: {
      kind: "customer", accountId: staffOrderResult.order.customerId, sessionVersion: 1,
    } }));
    const customerOrders = await customerCaller.accounts.customer.orders();
    expect(customerOrders.some(order => order.id === staffOrderResult.order.id)).toBe(true);
    expect(customerOrders.some(order => order.id === ownerOrderResult.order.id)).toBe(false);
    await expect(customerCaller.accounts.customer.order({ id: ownerOrderResult.order.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const audit = await ownerCaller.platform.audit({ branchId: 1, limit: 500 });
    const orderAudit = audit.filter(log => log.entityType === "service_order" && log.entityId === String(staffOrderResult.order.id));
    for (const action of ["order.created", "order.intake.updated", "order.photo.uploaded"]) {
      expect(orderAudit.find(log => log.action === action)).toMatchObject({ actorType: "staff", actorId: full.staff.id, integrityStatus: "verified" });
    }
    expect(orderAudit.find(log => log.action === "order.status.updated")).toMatchObject({ actorType: "owner", integrityStatus: "verified" });
  }, 90_000);

  it("applies every staff permission and revokes removed permissions immediately", async () => {
    const owner = appRouter.createCaller(await testContext({ owner: true, ownerBranchId: 1 }));
    const suffix = `${Date.now()}-${randomUUID().slice(0, 5)}`;
    const phone = `055${Date.now().toString().slice(-7)}`;
    const allPermissions = [
      "orders.view_branch",
      "orders.create",
      "orders.update_intake",
      "orders.update_status",
      "orders.view_prices",
      "orders.view_internal_notes",
      "customers.view",
      "customers.create",
      "photos.upload",
      "photos.view",
      "alerts.view",
      "alerts.create",
      "alerts.update",
    ] as const;
    const created = await owner.accounts.staff.create({
      branchId: 1,
      name: "موظف مصفوفة الصلاحيات",
      username: `permission-matrix-${suffix}`,
      permissions: [...allPermissions],
    });
    if (!created.staff) throw new Error("Staff setup failed");
    createdStaffIds.push(created.staff.id);

    const orderResult = await owner.orders.create({
      serviceType: "maintenance",
      deviceInfo: `جهاز مصفوفة الصلاحيات ${suffix}`,
      customerName: "عميل مصفوفة الصلاحيات",
      customerPhone: phone,
      price: 23_500,
      cost: 7_000,
      amountPaid: 5_000,
      internalNotes: "ملاحظة داخلية لا تظهر إلا بصلاحية مستقلة",
      deviceLocation: "رف مصفوفة الصلاحيات",
    });
    createdOrderIds.push(orderResult.order.id);
    if (orderResult.order.customerId) createdCustomerIds.push(orderResult.order.customerId);
    await owner.orders.uploadPhoto({
      orderId: orderResult.order.id,
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      caption: "صورة مصفوفة الصلاحيات",
      visibleToCustomer: false,
    });

    const fullCaller = appRouter.createCaller(await testContext({ portalSession: {
      kind: "staff",
      accountId: created.staff.id,
      branchId: 1,
      sessionVersion: created.staff.sessionVersion,
    } }));
    const fullList = await fullCaller.staff.orders.list();
    const fullOrder = fullList.find(order => order.id === orderResult.order.id);
    expect(fullOrder).toMatchObject({ price: 23_500, cost: 7_000, amountPaid: 5_000, internalNotes: "ملاحظة داخلية لا تظهر إلا بصلاحية مستقلة" });
    expect((await fullCaller.staff.orders.get({ id: orderResult.order.id })).photos).toHaveLength(1);
    expect((await fullCaller.staff.customers.searchByPhone({ phone })).orders.map(order => order.id)).toContain(orderResult.order.id);
    await fullCaller.staff.orders.updateIntake({
      id: orderResult.order.id,
      deviceLocation: "رف محدث بالصلاحية",
      price: 24_500,
      cost: 8_000,
      amountPaid: 6_000,
      estimatedTime: 120,
      warrantyDays: 730,
    });
    expect((await fullCaller.staff.orders.get({ id: orderResult.order.id })).order).toMatchObject({
      price: 24_500,
      cost: 8_000,
      amountPaid: 6_000,
      estimatedTime: 120,
      warrantyDays: 730,
    });
    await fullCaller.staff.orders.updateStatus({ id: orderResult.order.id, status: "diagnosing", visibleToCustomer: true });
    await fullCaller.staff.orders.uploadPhoto({
      orderId: orderResult.order.id,
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      caption: "صورة رفع بصلاحية",
      visibleToCustomer: false,
    });
    const createdByStaff = await fullCaller.staff.orders.create({
      serviceType: "maintenance",
      deviceInfo: `جهاز إنشاء عميل جديد ${suffix}`,
      customerName: "عميل جديد بالصلاحية",
      customerPhone: `053${Date.now().toString().slice(-7)}`,
      price: 12_000,
      cost: 3_500,
      amountPaid: 2_000,
      estimatedTime: 60,
      warrantyDays: 30,
    });
    createdOrderIds.push(createdByStaff.order.id);
    expect(createdByStaff.order).toMatchObject({ price: 12_000, cost: 3_500, amountPaid: 2_000 });
    if (createdByStaff.order.customerId) createdCustomerIds.push(createdByStaff.order.customerId);
    const alert = await fullCaller.internalAlerts.staff.create({
      alertType: "important",
      title: `تنبيه مصفوفة الصلاحيات ${suffix}`,
      priority: "important",
      status: "missing",
    });
    createdAlertIds.push(alert.id);
    expect((await fullCaller.internalAlerts.staff.list()).some(item => item.id === alert.id)).toBe(true);
    await fullCaller.internalAlerts.staff.update({ id: alert.id, status: "resolved" });

    const reduced = await owner.accounts.staff.update({
      id: created.staff.id,
      permissions: ["orders.view_branch", "orders.create"],
    });
    expect(reduced?.sessionVersion).toBe(created.staff.sessionVersion + 1);
    await expect(fullCaller.staff.orders.list()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "STAFF_SESSION_EXPIRED" });

    const reducedCaller = appRouter.createCaller(await testContext({ portalSession: {
      kind: "staff",
      accountId: created.staff.id,
      branchId: 1,
      sessionVersion: reduced!.sessionVersion,
    } }));
    const reducedOrder = (await reducedCaller.staff.orders.list()).find(order => order.id === orderResult.order.id);
    expect(reducedOrder).toMatchObject({ price: 0, amountPaid: 0 });
    expect(reducedOrder).not.toHaveProperty("cost");
    expect(reducedOrder).not.toHaveProperty("internalNotes");
    expect((await reducedCaller.staff.orders.get({ id: orderResult.order.id })).photos).toEqual([]);
    await expect(reducedCaller.staff.customers.searchByPhone({ phone })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reducedCaller.staff.orders.updateIntake({ id: orderResult.order.id, deviceLocation: "محاولة ممنوعة" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reducedCaller.staff.orders.updateStatus({ id: orderResult.order.id, status: "in_progress", visibleToCustomer: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reducedCaller.staff.orders.uploadPhoto({
      orderId: orderResult.order.id,
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      visibleToCustomer: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reducedCaller.internalAlerts.staff.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reducedCaller.internalAlerts.staff.create({ alertType: "important", title: "محاولة تنبيه ممنوعة", priority: "normal", status: "missing" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reducedCaller.internalAlerts.staff.update({ id: alert.id, status: "missing" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reducedCaller.staff.orders.create({
      serviceType: "maintenance",
      deviceInfo: "جهاز عميل جديد ممنوع",
      customerName: "عميل بلا صلاحية إنشاء",
      customerPhone: `052${Date.now().toString().slice(-7)}`,
      price: 99_000,
      amountPaid: 99_000,
      estimatedTime: 0,
      warrantyDays: 30,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const existingCustomerOrder = await reducedCaller.staff.orders.create({
      serviceType: "maintenance",
      deviceInfo: `جهاز عميل موجود بلا أسعار ${suffix}`,
      customerName: "عميل مصفوفة الصلاحيات",
      customerPhone: phone,
      price: 99_000,
      cost: 99_000,
      amountPaid: 99_000,
      estimatedTime: 0,
      warrantyDays: 30,
    });
    createdOrderIds.push(existingCustomerOrder.order.id);
    expect(existingCustomerOrder.order).toMatchObject({ price: 0, amountPaid: 0 });
    expect(existingCustomerOrder.order).not.toHaveProperty("cost");

    const noAccess = await owner.accounts.staff.update({ id: created.staff.id, permissions: [] });
    expect(noAccess?.sessionVersion).toBe(reduced!.sessionVersion + 1);
    await expect(reducedCaller.staff.orders.list()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "STAFF_SESSION_EXPIRED" });
    const noAccessCaller = appRouter.createCaller(await testContext({ portalSession: {
      kind: "staff",
      accountId: created.staff.id,
      branchId: 1,
      sessionVersion: noAccess!.sessionVersion,
    } }));
    await expect(noAccessCaller.staff.orders.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(noAccessCaller.staff.orders.create({
      serviceType: "maintenance",
      deviceInfo: "محاولة إنشاء بلا صلاحيات",
      customerName: "عميل ممنوع",
      customerPhone: phone,
      price: 0,
      amountPaid: 0,
      estimatedTime: 0,
      warrantyDays: 30,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  }, 120_000);
});

describe("WhatsApp events per branch", () => {
  it("queues account, invoice, ready, delivered, warranty, and winning messages with each branch template", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const suffix = randomUUID().slice(0, 8);
    const branchRows: Array<{ id: number; marker: string }> = [];
    for (const marker of ["WA-A", "WA-B"]) {
      const result = await db.insert(branches).values({
        name: `فرع اختبار ${marker} ${suffix}`,
        slug: `vitest-${marker.toLowerCase()}-${suffix}`,
        code: `${marker.replace("-", "")}${suffix}`.slice(0, 20).toUpperCase(),
        sortOrder: 999,
        isActive: true,
      });
      const id = Number(result[0].insertId);
      createdBranchIds.push(id);
      branchRows.push({ id, marker });
      await db.insert(branchSettings).values({ branchId: id, displayName: `فرع ${marker}`, whatsappPhone: "0550000000" });
    }

    const events: Array<{ event: WhatsAppEvent; templateKey: string }> = [
      { event: "account_created", templateKey: "account_created" },
      { event: "invoice_created", templateKey: "invoice_created" },
      { event: "status_ready", templateKey: "order_ready" },
      { event: "status_delivered", templateKey: "order_delivered" },
      { event: "warranty_activated", templateKey: "warranty_activated" },
      { event: "scratch_win", templateKey: "scratch_won" },
    ];
    for (const branch of branchRows) {
      await db.insert(whatsappTemplates).values(events.map(({ templateKey }) => ({
        branchId: branch.id,
        eventType: templateKey,
        bodyPreview: `${branch.marker}-${templateKey}-{{order_number}}`,
        languageCode: "ar",
        isActive: true,
      })));
      const order = await createServiceOrder({
        branchId: branch.id,
        serviceType: "maintenance",
        deviceInfo: `جهاز اختبار تكامل مؤقت واتساب ${branch.marker} ${suffix}`,
        customerName: `عميل ${branch.marker}`,
        customerPhone: "0550000000",
      });
      createdOrderIds.push(order.id);
      for (const { event } of events) {
        await queueWhatsAppNotification(order, event, "fallback", { order_number: order.barcode });
      }
      const rows = await db.select().from(notificationMessages).where(eq(notificationMessages.orderId, order.id));
      expect(rows).toHaveLength(events.length);
      for (const { event } of events) {
        expect(rows.find(row => row.eventType === event)).toMatchObject({ branchId: branch.id, status: "requires_setup" });
        expect(rows.find(row => row.eventType === event)?.message).toContain(branch.marker);
      }
    }
  }, 60_000);
});
