import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, like, lte, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  type InsertUser,
  type ServiceOrderStatus,
  additionalRepairProposals,
  serviceRatings,
  notificationMessages,
  orderPhotos,
  orderStatusHistory,
  orderStatusPopupReceipts,
  serviceOrders,
  smsMessages,
  staffAccounts,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  buildApprovalUpdate,
  buildArchiveUpdate,
  buildStatusUpdate,
} from "./orderWorkflow";
import { calculateEstimatedCompletionAt, calculateWarrantyExpiresAt } from "../shared/serviceUnits";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0];
}

export type CreateOrderInput = {
  branchId?: number;
  customerId?: number;
  createdByStaffId?: number;
  receivedByStaffId?: number;
  serviceType: "maintenance" | "programming";
  deviceInfo: string;
  reportedIssue?: string;
  deviceBrand?: string;
  deviceModel?: string;
  serialNumber?: string;
  receivedAccessories?: string;
  intakeCondition?: string;
  customerName?: string;
  customerPhone?: string;
  customerVisibleNotes?: string;
  internalNotes?: string;
  deviceLocation?: string;
  price?: number;
  cost?: number;
  amountPaid?: number;
  estimatedTime?: number;
  estimatedCompletionAt?: number;
  warrantyDays?: number;
  requestPriceApproval?: boolean;
};

export type OrderActor = {
  type: "owner" | "staff" | "customer" | "system";
  id?: number | null;
  name?: string;
  branchId?: number | null;
};

function actorLabel(actor?: OrderActor) {
  if (!actor) return "المالك";
  if (actor.name) return actor.name;
  if (actor.type === "staff") return "موظف";
  if (actor.type === "customer") return "الزبون";
  if (actor.type === "system") return "النظام";
  return "المالك";
}

function calculatePaymentStatus(price: number, amountPaid: number) {
  if (price > 0 && amountPaid >= price) return "paid" as const;
  if (amountPaid > 0) return "partial" as const;
  return "unpaid" as const;
}

function isBarcodeDuplicate(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const record = current as { code?: string; sqlMessage?: string; message?: string; cause?: unknown };
    if (
      record.code === "ER_DUP_ENTRY" &&
      `${record.sqlMessage ?? record.message ?? ""}`.includes("service_orders_barcode_unique")
    ) return true;
    current = record.cause;
  }
  return false;
}

async function getNextNumericBarcode(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const [row] = await db
    .select({
      current: sql<number>`COALESCE(MAX(CASE WHEN ${serviceOrders.barcode} REGEXP '^[0-9]+$' THEN CAST(${serviceOrders.barcode} AS UNSIGNED) ELSE 0 END), 0)`,
    })
    .from(serviceOrders);
  return String(Number(row?.current ?? 0) + 1);
}

export async function createServiceOrder(input: CreateOrderInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const publicToken = randomBytes(18).toString("hex");
  const now = Date.now();
  const price = input.price ?? 0;
  const amountPaid = input.amountPaid ?? 0;
  const estimatedTime = input.estimatedTime ?? 0;
  const requestPriceApproval = Boolean(input.requestPriceApproval && price > 0 && input.customerPhone?.trim());
  const estimatedCompletionAt = input.estimatedCompletionAt ?? calculateEstimatedCompletionAt(now, estimatedTime);

  let inserted = false;
  for (let attempt = 0; attempt < 12 && !inserted; attempt += 1) {
    const barcode = await getNextNumericBarcode(db);
    try {
      await db.insert(serviceOrders).values({
        branchId: input.branchId ?? 1,
        customerId: input.customerId,
        createdByStaffId: input.createdByStaffId,
        receivedByStaffId: input.receivedByStaffId ?? input.createdByStaffId,
        barcode,
        publicToken,
        serviceType: input.serviceType,
        deviceInfo: input.deviceInfo,
        reportedIssue: input.reportedIssue,
        deviceBrand: input.deviceBrand,
        deviceModel: input.deviceModel,
        serialNumber: input.serialNumber,
        receivedAccessories: input.receivedAccessories,
        intakeCondition: input.intakeCondition,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerVisibleNotes: input.customerVisibleNotes,
        internalNotes: input.internalNotes,
        deviceLocation: input.deviceLocation,
        notes: input.customerVisibleNotes,
        price,
        cost: input.cost ?? 0,
        amountPaid,
        paymentStatus: calculatePaymentStatus(price, amountPaid),
        status: requestPriceApproval ? "awaiting_approval" : "pending",
        priceApprovalStatus: requestPriceApproval ? "pending" : "not_required",
        approvalRequestedAt: requestPriceApproval ? now : null,
        approvalRespondedAt: null,
        estimatedTime,
        estimatedCompletionAt,
        warrantyDays: input.warrantyDays ?? 30,
      });
      inserted = true;
    } catch (error) {
      if (!isBarcodeDuplicate(error) || attempt === 11) throw error;
    }
  }
  if (!inserted) throw new Error("ORDER_NUMBER_ALLOCATION_FAILED");

  const order = await getServiceOrderByPublicToken(publicToken);
  if (!order) throw new Error("Order creation failed");

  await db.insert(orderStatusHistory).values({
    orderId: order.id,
    fromStatus: null,
    toStatus: requestPriceApproval ? "awaiting_approval" : "pending",
    note: requestPriceApproval
      ? `تم استلام الجهاز وبانتظار موافقة الزبون على السعر: ${(price / 100).toFixed(2)}`
      : "تم استلام الجهاز وإنشاء الطلب",
    visibleToCustomer: true,
    changedBy: input.createdByStaffId ? "موظف" : "المالك",
    changedByType: input.createdByStaffId ? "staff" : "owner",
    changedById: input.createdByStaffId ?? null,
    createdAt: now,
  });

  return order;
}

export async function getServiceOrderByBarcode(barcode: string, branchId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  const condition = branchId
    ? and(eq(serviceOrders.barcode, barcode), eq(serviceOrders.branchId, branchId))
    : eq(serviceOrders.barcode, barcode);
  const rows = await db.select().from(serviceOrders).where(condition).limit(1);
  return rows[0];
}

export async function getServiceOrderByPublicToken(publicToken: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(serviceOrders)
    .where(eq(serviceOrders.publicToken, publicToken))
    .limit(1);
  return rows[0];
}

export async function getServiceOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(serviceOrders).where(eq(serviceOrders.id, id)).limit(1);
  return rows[0];
}

export type OrderListFilters = {
  branchId?: number;
  search?: string;
  status?: ServiceOrderStatus | "all";
  serviceType?: "maintenance" | "programming" | "all";
  archived?: boolean;
  from?: number;
  to?: number;
};

export async function listServiceOrders(filters: OrderListFilters = {}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: SQL[] = [eq(serviceOrders.archived, filters.archived ?? false)];

  if (filters.branchId) conditions.push(eq(serviceOrders.branchId, filters.branchId));

  if (filters.status && filters.status !== "all") {
    conditions.push(eq(serviceOrders.status, filters.status));
  }
  if (filters.serviceType && filters.serviceType !== "all") {
    conditions.push(eq(serviceOrders.serviceType, filters.serviceType));
  }
  if (filters.from) conditions.push(gte(serviceOrders.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(serviceOrders.createdAt, new Date(filters.to)));
  if (filters.search?.trim()) {
    const value = `%${filters.search.trim()}%`;
    const searchCondition = or(
      like(serviceOrders.barcode, value),
      like(serviceOrders.customerName, value),
      like(serviceOrders.customerPhone, value),
      like(serviceOrders.deviceInfo, value),
      like(serviceOrders.deviceBrand, value),
      like(serviceOrders.deviceModel, value),
      like(serviceOrders.serialNumber, value),
      like(serviceOrders.deviceLocation, value),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  return db
    .select()
    .from(serviceOrders)
    .where(and(...conditions))
    .orderBy(desc(serviceOrders.createdAt));
}

export async function getAllServiceOrders() {
  return listServiceOrders();
}

export async function getOrderStatusHistory(orderId: number, customerOnly = false) {
  const db = await getDb();
  if (!db) return [];
  const condition = customerOnly
    ? and(eq(orderStatusHistory.orderId, orderId), eq(orderStatusHistory.visibleToCustomer, true))
    : eq(orderStatusHistory.orderId, orderId);
  return db.select().from(orderStatusHistory).where(condition).orderBy(orderStatusHistory.createdAt);
}

export async function getOrderPhotos(orderId: number, customerOnly = false) {
  const db = await getDb();
  if (!db) return [];
  const condition = customerOnly
    ? and(eq(orderPhotos.orderId, orderId), eq(orderPhotos.visibleToCustomer, true))
    : eq(orderPhotos.orderId, orderId);
  return db.select().from(orderPhotos).where(condition).orderBy(desc(orderPhotos.createdAt));
}

export async function addOrderPhoto(input: {
  orderId: number;
  storageKey: string;
  url: string;
  caption?: string;
  visibleToCustomer?: boolean;
  uploadedByStaffId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(orderPhotos).values({
    orderId: input.orderId,
    storageKey: input.storageKey,
    url: input.url,
    caption: input.caption,
    visibleToCustomer: input.visibleToCustomer ?? false,
    uploadedByStaffId: input.uploadedByStaffId,
    createdAt: Date.now(),
  });
  return getOrderPhotos(input.orderId);
}

export async function updateOrderPhotoVisibility(photoId: number, visibleToCustomer: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(orderPhotos)
    .set({ visibleToCustomer })
    .where(eq(orderPhotos.id, photoId));
}

export async function deleteOrderPhoto(photoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(orderPhotos).where(eq(orderPhotos.id, photoId));
}

export async function getOrderNotifications(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notificationMessages)
    .where(eq(notificationMessages.orderId, orderId))
    .orderBy(desc(notificationMessages.createdAt));
}

export async function getOwnerOrderBundle(id: number) {
  const order = await getServiceOrderById(id);
  if (!order) return undefined;
  const [history, photos, notifications] = await Promise.all([
    getOrderStatusHistory(id),
    getOrderPhotos(id),
    getOrderNotifications(id),
  ]);
  const staffIds = Array.from(new Set([
    order.createdByStaffId,
    order.receivedByStaffId,
    order.lastUpdatedByStaffId,
    order.deviceLocationUpdatedByStaffId,
    ...photos.map(photo => photo.uploadedByStaffId),
  ].filter((value): value is number => typeof value === "number")));
  const db = await getDb();
  const staffRows = db && staffIds.length
    ? await db
        .select({ id: staffAccounts.id, name: staffAccounts.name, jobTitle: staffAccounts.jobTitle })
        .from(staffAccounts)
        .where(or(...staffIds.map(staffId => eq(staffAccounts.id, staffId))))
    : [];
  const staffById = Object.fromEntries(staffRows.map(staff => [staff.id, staff]));
  return {
    order,
    history,
    photos: photos.map(photo => ({
      ...photo,
      uploadedBy: photo.uploadedByStaffId ? staffById[photo.uploadedByStaffId] ?? null : null,
    })),
    notifications,
    staffActors: {
      createdBy: order.createdByStaffId ? staffById[order.createdByStaffId] ?? null : null,
      receivedBy: order.receivedByStaffId ? staffById[order.receivedByStaffId] ?? null : null,
      lastUpdatedBy: order.lastUpdatedByStaffId ? staffById[order.lastUpdatedByStaffId] ?? null : null,
      locationUpdatedBy: order.deviceLocationUpdatedByStaffId
        ? staffById[order.deviceLocationUpdatedByStaffId] ?? null
        : null,
    },
  };
}

export async function getCustomerOrderBundle(params: {
  token?: string;
  barcode?: string;
  phoneLast4?: string;
  branchId?: number;
  includeArchived?: boolean;
}) {
  const order = params.token
    ? await getServiceOrderByPublicToken(params.token)
    : params.barcode
      ? await getServiceOrderByBarcode(params.barcode, params.branchId)
      : undefined;
  if (!order || (order.archived && !params.includeArchived)) return undefined;

  if (!params.token && order.customerPhone) {
    const normalizedPhone = order.customerPhone.replace(/\D/g, "");
    const normalizedLast4 = params.phoneLast4?.replace(/\D/g, "") ?? "";
    if (normalizedLast4.length !== 4 || !normalizedPhone.endsWith(normalizedLast4)) return undefined;
  }

  const [history, photos] = await Promise.all([
    getOrderStatusHistory(order.id, true),
    getOrderPhotos(order.id, true),
  ]);

  return {
    order: {
      id: order.id,
      branchId: order.branchId,
      barcode: order.barcode,
      publicToken: order.publicToken,
      serviceType: order.serviceType,
      deviceInfo: order.deviceInfo,
      deviceBrand: order.deviceBrand,
      deviceModel: order.deviceModel,
      status: order.status,
      price: order.price,
      amountPaid: order.amountPaid,
      paymentStatus: order.paymentStatus,
      priceApprovalStatus: order.priceApprovalStatus,
      approvalRequestedAt: order.approvalRequestedAt,
      approvalRespondedAt: order.approvalRespondedAt,
      estimatedTime: order.estimatedTime,
      estimatedCompletionAt: order.estimatedCompletionAt,
      customerName: order.customerName,
      customerVisibleNotes: order.customerVisibleNotes,
      warrantyDays: order.warrantyDays,
      warrantyExpiresAt: order.warrantyExpiresAt,
      deliveredAt: order.deliveredAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    },
    history,
    photos,
  };
}

export async function claimOrderDeliveryPopup(orderToken: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const order = await getServiceOrderByPublicToken(orderToken);
  if (!order || order.archived || order.status !== "delivered") return { show: false as const };
  if (order.deliveryPopupSeenAt) return { show: false as const };

  const seenAt = Date.now();
  const result = await db
    .update(serviceOrders)
    .set({ deliveryPopupSeenAt: seenAt })
    .where(and(
      eq(serviceOrders.id, order.id),
      eq(serviceOrders.status, "delivered"),
      eq(serviceOrders.archived, false),
      isNull(serviceOrders.deliveryPopupSeenAt),
    ));
  const claimed = Number(result[0].affectedRows) === 1;
  return claimed ? { show: true as const, seenAt } : { show: false as const };
}

export async function claimOrderStatusPopup(orderToken: string, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const order = await getServiceOrderByPublicToken(orderToken);
  if (!order || order.archived || order.status !== status || status === "delivered") return { show: false as const };

  const [existing] = await db
    .select({ id: orderStatusPopupReceipts.id })
    .from(orderStatusPopupReceipts)
    .where(and(eq(orderStatusPopupReceipts.orderId, order.id), eq(orderStatusPopupReceipts.status, status)))
    .limit(1);
  if (existing) return { show: false as const };

  const seenAt = Date.now();
  try {
    await db.insert(orderStatusPopupReceipts).values({ orderId: order.id, status, seenAt });
    return { show: true as const, seenAt };
  } catch (error) {
    const [claimedByAnotherRequest] = await db
      .select({ id: orderStatusPopupReceipts.id })
      .from(orderStatusPopupReceipts)
      .where(and(eq(orderStatusPopupReceipts.orderId, order.id), eq(orderStatusPopupReceipts.status, status)))
      .limit(1);
    if (claimedByAnotherRequest) return { show: false as const };
    throw error;
  }
}

export async function updateServiceOrderStatus(
  id: number,
  status: ServiceOrderStatus,
  note?: string,
  visibleToCustomer = true,
  actor?: OrderActor,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const order = await getServiceOrderById(id);
  if (!order) throw new Error("Order not found");

  const now = Date.now();
  const updates = buildStatusUpdate(status, order.warrantyDays, now);

  await db
    .update(serviceOrders)
    .set({
      ...updates,
      ...(actor?.type === "staff" ? { lastUpdatedByStaffId: actor.id ?? null } : {}),
    })
    .where(eq(serviceOrders.id, id));
  await db.insert(orderStatusHistory).values({
    orderId: id,
    fromStatus: order.status,
    toStatus: status,
    note,
    visibleToCustomer,
    changedBy: actorLabel(actor),
    changedByType: actor?.type ?? "owner",
    changedById: actor?.id ?? null,
    createdAt: now,
  });
  return getServiceOrderById(id);
}

export type OrderDetailsUpdate = {
  customerId?: number | null;
  deviceInfo?: string;
  reportedIssue?: string | null;
  deviceBrand?: string | null;
  deviceModel?: string | null;
  serialNumber?: string | null;
  receivedAccessories?: string | null;
  intakeCondition?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerVisibleNotes?: string | null;
  internalNotes?: string | null;
  deviceLocation?: string | null;
  price?: number;
  cost?: number;
  amountPaid?: number;
  estimatedTime?: number;
  estimatedCompletionAt?: number | null;
  warrantyDays?: number;
  requestPriceApproval?: boolean;
};

export async function updateServiceOrderDetails(id: number, updates: OrderDetailsUpdate, actor?: OrderActor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const order = await getServiceOrderById(id);
  if (!order) throw new Error("Order not found");

  const { requestPriceApproval, ...fields } = updates;
  const price = fields.price ?? order.price;
  const amountPaid = fields.amountPaid ?? order.amountPaid;
  const updateSet: Record<string, unknown> = {
    ...fields,
    paymentStatus: calculatePaymentStatus(price, amountPaid),
  };
  if (fields.estimatedTime !== undefined && fields.estimatedCompletionAt === undefined) {
    updateSet.estimatedCompletionAt = calculateEstimatedCompletionAt(order.createdAt, fields.estimatedTime);
  }
  if (fields.warrantyDays !== undefined && order.deliveredAt) {
    updateSet.warrantyExpiresAt = calculateWarrantyExpiresAt(order.deliveredAt, fields.warrantyDays);
  }
  if (actor?.type === "staff") {
    updateSet.lastUpdatedByStaffId = actor.id ?? null;
    if (fields.deviceLocation !== undefined) updateSet.deviceLocationUpdatedByStaffId = actor.id ?? null;
  }

  if (fields.customerVisibleNotes !== undefined) updateSet.notes = fields.customerVisibleNotes;
  if (requestPriceApproval) {
    updateSet.priceApprovalStatus = "pending";
    updateSet.approvalRequestedAt = Date.now();
    updateSet.approvalRespondedAt = null;
    updateSet.status = "awaiting_approval";
  }

  await db.update(serviceOrders).set(updateSet).where(eq(serviceOrders.id, id));

  if (requestPriceApproval && order.status !== "awaiting_approval") {
    await db.insert(orderStatusHistory).values({
      orderId: id,
      fromStatus: order.status,
      toStatus: "awaiting_approval",
      note: `بانتظار موافقة الزبون على السعر: ${(price / 100).toFixed(2)}`,
      visibleToCustomer: true,
      changedBy: actorLabel(actor),
      changedByType: actor?.type ?? "owner",
      changedById: actor?.id ?? null,
      createdAt: Date.now(),
    });
  }

  return getServiceOrderById(id);
}

export async function respondToPriceApproval(publicToken: string, decision: "approved" | "rejected") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const order = await getServiceOrderByPublicToken(publicToken);
  if (!order || order.priceApprovalStatus !== "pending") return undefined;

  const now = Date.now();
  const approval = buildApprovalUpdate(decision, now);
  await db
    .update(serviceOrders)
    .set({
      priceApprovalStatus: approval.priceApprovalStatus,
      approvalRespondedAt: approval.approvalRespondedAt,
      status: approval.status,
    })
    .where(eq(serviceOrders.id, order.id));
  await db.insert(orderStatusHistory).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: approval.status,
    note: approval.note,
    visibleToCustomer: true,
    changedBy: "الزبون",
    changedByType: "customer",
    changedById: order.customerId,
    createdAt: now,
  });
  return getCustomerOrderBundle({ token: publicToken });
}

export async function setOrderArchived(id: number, archived: boolean, actor?: OrderActor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(serviceOrders)
    .set(buildArchiveUpdate(archived))
    .where(eq(serviceOrders.id, id));
  const order = await getServiceOrderById(id);
  if (order) {
    await db.insert(orderStatusHistory).values({
      orderId: id,
      fromStatus: order.status,
      toStatus: order.status,
      note: archived ? "تمت أرشفة الطلب" : "تمت استعادة الطلب من الأرشيف",
      visibleToCustomer: false,
      changedBy: actorLabel(actor),
      changedByType: actor?.type ?? "owner",
      changedById: actor?.id ?? null,
      createdAt: Date.now(),
    });
  }
}

export async function setOrdersArchived(ids: number[], archived: boolean, actor?: OrderActor) {
  const uniqueIds = Array.from(new Set(ids.filter(id => Number.isInteger(id) && id > 0)));
  if (!uniqueIds.length) return { success: true as const, count: 0 };
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const orders = await db
    .select({ id: serviceOrders.id, status: serviceOrders.status })
    .from(serviceOrders)
    .where(inArray(serviceOrders.id, uniqueIds));
  if (orders.length !== uniqueIds.length) throw new Error("ORDER_BATCH_MISMATCH");

  await db
    .update(serviceOrders)
    .set(buildArchiveUpdate(archived))
    .where(inArray(serviceOrders.id, uniqueIds));

  const createdAt = Date.now();
  await db.insert(orderStatusHistory).values(orders.map(order => ({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: order.status,
    note: archived ? "تمت أرشفة الطلب ضمن مجموعة" : "تمت استعادة الطلب ضمن مجموعة",
    visibleToCustomer: false,
    changedBy: actorLabel(actor),
    changedByType: actor?.type ?? "owner",
    changedById: actor?.id ?? null,
    createdAt,
  })));
  return { success: true as const, count: orders.length };
}

export async function normalizeServiceOrderBarcodes() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const orders = await db
    .select({ id: serviceOrders.id })
    .from(serviceOrders)
    .orderBy(asc(serviceOrders.createdAt), asc(serviceOrders.id));

  const temporaryPrefix = `renumber-${Date.now()}-`;
  for (const order of orders) {
    await db
      .update(serviceOrders)
      .set({ barcode: `${temporaryPrefix}${order.id}` })
      .where(eq(serviceOrders.id, order.id));
  }

  for (let index = 0; index < orders.length; index += 1) {
    const order = orders[index];
    await db
      .update(serviceOrders)
      .set({ barcode: String(index + 1) })
      .where(eq(serviceOrders.id, order.id));
  }

  return { success: true as const, count: orders.length, nextBarcode: String(orders.length + 1) };
}

export async function purgeServiceOrdersForTests(ids: number[]) {
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    throw new Error("Test cleanup is only available in the test environment");
  }
  const uniqueIds = Array.from(new Set(ids.filter(id => Number.isInteger(id) && id > 0)));
  if (!uniqueIds.length) return;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(notificationMessages).where(inArray(notificationMessages.orderId, uniqueIds));
  await db.delete(additionalRepairProposals).where(inArray(additionalRepairProposals.orderId, uniqueIds));
  await db.delete(serviceRatings).where(inArray(serviceRatings.orderId, uniqueIds));
  await db.delete(smsMessages).where(inArray(smsMessages.orderId, uniqueIds));
  await db.delete(orderPhotos).where(inArray(orderPhotos.orderId, uniqueIds));
  await db.delete(orderStatusPopupReceipts).where(inArray(orderStatusPopupReceipts.orderId, uniqueIds));
  await db.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, uniqueIds));
  await db.delete(serviceOrders).where(inArray(serviceOrders.id, uniqueIds));
}

export async function purgeServiceOrderForTests(id: number) {
  return purgeServiceOrdersForTests([id]);
}

export async function purgeIntegrationTestOrders() {
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    throw new Error("Test cleanup is only available in the test environment");
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const testOrders = await db
    .select({ id: serviceOrders.id })
    .from(serviceOrders)
    .where(like(serviceOrders.deviceInfo, "جهاز اختبار تكامل مؤقت %"));
  await purgeServiceOrdersForTests(testOrders.map(order => order.id));
}

export async function deleteServiceOrder(id: number) {
  return setOrderArchived(id, true);
}

export async function createNotificationRecord(input: {
  orderId: number;
  branchId?: number;
  customerId?: number;
  eventType: string;
  templateKey?: string;
  recipient: string;
  message: string;
  status?: "pending" | "sent" | "failed" | "requires_setup";
  failureReason?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(notificationMessages).values({
    ...input,
    status: input.status ?? "requires_setup",
    createdAt: Date.now(),
  });
}

export async function sendSmsNotification(orderId: number, phoneNumber: string, message: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(smsMessages).values({
    orderId,
    phoneNumber,
    message,
    status: "pending",
  });
}

export async function getOrderSmsMessages(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(smsMessages).where(eq(smsMessages.orderId, orderId)).orderBy(desc(smsMessages.createdAt));
}

export async function getDashboardReport(branchId?: number) {
  const db = await getDb();
  const orders = await listServiceOrders({ archived: false, branchId });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const activeStatuses = new Set<ServiceOrderStatus>([
    "pending",
    "diagnosing",
    "awaiting_approval",
    "in_progress",
    "ready",
  ]);

  const monthOrders = orders.filter(order => new Date(order.createdAt).getTime() >= monthStart);
  const todayOrders = orders.filter(order => new Date(order.createdAt).getTime() >= todayStart);
  const totalRevenue = monthOrders.reduce((sum, order) => sum + order.amountPaid, 0);
  const totalCost = monthOrders.reduce((sum, order) => sum + order.cost, 0);
  const todayRevenue = todayOrders.reduce((sum, order) => sum + order.amountPaid, 0);
  const todayCost = todayOrders.reduce((sum, order) => sum + order.cost, 0);
  const reportableOrders = orders.filter(order => order.status !== "cancelled");
  const deliveredOrders = reportableOrders.filter(order => order.deliveredAt && order.deliveredAt > new Date(order.createdAt).getTime());
  const completionDurations = deliveredOrders.map(order => (order.deliveredAt ?? 0) - new Date(order.createdAt).getTime());
  const orderIds = reportableOrders.map(order => order.id);
  const startEvents = db && orderIds.length
    ? await db
        .select({ orderId: orderStatusHistory.orderId, createdAt: orderStatusHistory.createdAt })
        .from(orderStatusHistory)
        .where(and(inArray(orderStatusHistory.orderId, orderIds), eq(orderStatusHistory.toStatus, "in_progress")))
        .orderBy(asc(orderStatusHistory.createdAt))
    : [];
  const firstStartByOrder = new Map<number, number>();
  for (const event of startEvents) if (!firstStartByOrder.has(event.orderId)) firstStartByOrder.set(event.orderId, event.createdAt);
  const waitDurations = reportableOrders.flatMap(order => {
    const startedAt = firstStartByOrder.get(order.id);
    const receivedAt = new Date(order.createdAt).getTime();
    return startedAt && startedAt >= receivedAt ? [startedAt - receivedAt] : [];
  });
  const faultCounts = new Map<string, { label: string; count: number }>();
  for (const order of reportableOrders) {
    const raw = (order.reportedIssue || order.intakeCondition || "").trim();
    if (!raw) continue;
    const label = raw.split(/[،,\n]/)[0].trim().replace(/\s+/g, " ").slice(0, 120);
    if (!label) continue;
    const key = label.toLocaleLowerCase("ar");
    const current = faultCounts.get(key);
    faultCounts.set(key, { label: current?.label ?? label, count: (current?.count ?? 0) + 1 });
  }
  const mostCommonFault = Array.from(faultCounts.values()).sort((a, b) => b.count - a.count)[0] ?? null;
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

  return {
    total: orders.length,
    active: orders.filter(order => activeStatuses.has(order.status)).length,
    ready: orders.filter(order => order.status === "ready").length,
    awaitingApproval: orders.filter(order => order.status === "awaiting_approval").length,
    today: todayOrders.length,
    month: monthOrders.length,
    todayRevenue,
    todayCost,
    todayProfit: todayRevenue - todayCost,
    revenue: totalRevenue,
    cost: totalCost,
    profit: totalRevenue - totalCost,
    unpaid: orders.reduce((sum, order) => sum + Math.max(order.price - order.amountPaid, 0), 0),
    mostCommonFault,
    averageCompletionMs: average(completionDurations),
    averageInvoiceValue: average(reportableOrders.map(order => order.price)),
    averageWaitBeforeWorkMs: average(waitDurations),
    completionSampleSize: completionDurations.length,
    waitSampleSize: waitDurations.length,
  };
}

export async function listCustomerOrders(customerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: serviceOrders.id,
      branchId: serviceOrders.branchId,
      barcode: serviceOrders.barcode,
      publicToken: serviceOrders.publicToken,
      serviceType: serviceOrders.serviceType,
      deviceInfo: serviceOrders.deviceInfo,
      deviceBrand: serviceOrders.deviceBrand,
      deviceModel: serviceOrders.deviceModel,
      status: serviceOrders.status,
      price: serviceOrders.price,
      amountPaid: serviceOrders.amountPaid,
      paymentStatus: serviceOrders.paymentStatus,
      priceApprovalStatus: serviceOrders.priceApprovalStatus,
      estimatedTime: serviceOrders.estimatedTime,
      estimatedCompletionAt: serviceOrders.estimatedCompletionAt,
      customerVisibleNotes: serviceOrders.customerVisibleNotes,
      warrantyDays: serviceOrders.warrantyDays,
      warrantyExpiresAt: serviceOrders.warrantyExpiresAt,
      deliveredAt: serviceOrders.deliveredAt,
      createdAt: serviceOrders.createdAt,
      updatedAt: serviceOrders.updatedAt,
    })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.customerId, customerId), eq(serviceOrders.archived, false)))
    .orderBy(desc(serviceOrders.createdAt));
}

export async function listCustomerOrdersForOwnerBranch(customerId: number, branchId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: serviceOrders.id,
      branchId: serviceOrders.branchId,
      barcode: serviceOrders.barcode,
      publicToken: serviceOrders.publicToken,
      serviceType: serviceOrders.serviceType,
      deviceInfo: serviceOrders.deviceInfo,
      deviceBrand: serviceOrders.deviceBrand,
      deviceModel: serviceOrders.deviceModel,
      status: serviceOrders.status,
      price: serviceOrders.price,
      amountPaid: serviceOrders.amountPaid,
      paymentStatus: serviceOrders.paymentStatus,
      priceApprovalStatus: serviceOrders.priceApprovalStatus,
      estimatedTime: serviceOrders.estimatedTime,
      estimatedCompletionAt: serviceOrders.estimatedCompletionAt,
      customerVisibleNotes: serviceOrders.customerVisibleNotes,
      warrantyDays: serviceOrders.warrantyDays,
      warrantyExpiresAt: serviceOrders.warrantyExpiresAt,
      deliveredAt: serviceOrders.deliveredAt,
      archived: serviceOrders.archived,
      createdAt: serviceOrders.createdAt,
      updatedAt: serviceOrders.updatedAt,
    })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.customerId, customerId), eq(serviceOrders.branchId, branchId)))
    .orderBy(desc(serviceOrders.createdAt));
}

export async function getCustomerAccountOrder(customerId: number, orderId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select({ publicToken: serviceOrders.publicToken })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.id, orderId), eq(serviceOrders.customerId, customerId), eq(serviceOrders.archived, false)))
    .limit(1);
  if (!rows[0]) return undefined;
  return getCustomerOrderBundle({ token: rows[0].publicToken });
}

// ============================================================================
// Site Content Management (CMS)
// ============================================================================

import { siteContent, contentEditLogs, type SiteContent, type InsertSiteContent } from "../drizzle/schema";

export async function getSiteContent(contentKey: string, branchId?: number): Promise<SiteContent | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const conditions: (SQL<unknown> | undefined)[] = [eq(siteContent.contentKey, contentKey), eq(siteContent.isActive, true)];
  if (branchId) {
    conditions.push(or(eq(siteContent.branchId, branchId), eq(siteContent.isGlobal, true)));
  }
  
  const validConditions = conditions.filter((c): c is SQL<unknown> => c !== undefined);
  const rows = await db
    .select()
    .from(siteContent)
    .where(validConditions.length > 0 ? and(...validConditions) : undefined)
    .orderBy(desc(siteContent.branchId))
    .limit(1);
  
  return rows[0];
}

export async function getAllSiteContent(branchId?: number): Promise<SiteContent[]> {
  const db = await getDb();
  if (!db) return [];
  
  const conditions: (SQL<unknown> | undefined)[] = [eq(siteContent.isActive, true)];
  if (branchId) {
    conditions.push(or(eq(siteContent.branchId, branchId), eq(siteContent.isGlobal, true)));
  }
  
  const validConditions = conditions.filter((c): c is SQL<unknown> => c !== undefined);
  return db
    .select()
    .from(siteContent)
    .where(validConditions.length > 0 ? and(...validConditions) : undefined)
    .orderBy(asc(siteContent.category), asc(siteContent.sortOrder));
}

export async function getSiteContentByCategory(category: string, branchId?: number): Promise<SiteContent[]> {
  const db = await getDb();
  if (!db) return [];
  
  const conditions: (SQL<unknown> | undefined)[] = [eq(siteContent.category, category), eq(siteContent.isActive, true)];
  if (branchId) {
    conditions.push(or(eq(siteContent.branchId, branchId), eq(siteContent.isGlobal, true)));
  }
  
  const validConditions = conditions.filter((c): c is SQL<unknown> => c !== undefined);
  return db
    .select()
    .from(siteContent)
    .where(validConditions.length > 0 ? and(...validConditions) : undefined)
    .orderBy(asc(siteContent.sortOrder));
}

export async function updateSiteContent(
  contentId: number,
  newValue: string,
  actor?: OrderActor
): Promise<SiteContent | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select().from(siteContent).where(eq(siteContent.id, contentId)).limit(1);
  if (!existing[0]) throw new Error("Content not found");
  
  const oldValue = existing[0].value;
  
  await db.update(siteContent).set({ value: newValue }).where(eq(siteContent.id, contentId));
  
  await db.insert(contentEditLogs).values({
    contentId,
    contentKey: existing[0].contentKey,
    oldValue,
    newValue,
    editedByType: actor?.type === "staff" ? "staff" : "owner",
    editedById: actor?.id ?? null,
    createdAt: Date.now(),
  });
  
  return getSiteContentById(contentId);
}

export async function getSiteContentById(id: number): Promise<SiteContent | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const rows = await db.select().from(siteContent).where(eq(siteContent.id, id)).limit(1);
  return rows[0];
}

export async function initializeSiteContent(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  const defaultContent: InsertSiteContent[] = [
    {
      contentKey: "site_title",
      contentType: "text",
      label: "عنوان الموقع",
      value: "هاتف التميز للاتصالات",
      defaultValue: "هاتف التميز للاتصالات",
      description: "اسم المتجر الرئيسي",
      isGlobal: true,
      category: "general",
      sortOrder: 1,
    },
    {
      contentKey: "site_tagline",
      contentType: "text",
      label: "الشعار الفرعي",
      value: "كل جديد على جهازك… قدام عينك، أول بأول ✔️🩵",
      defaultValue: "كل جديد على جهازك… قدام عينك، أول بأول ✔️🩵",
      description: "العبارة الترويجية الرئيسية",
      isGlobal: true,
      category: "general",
      sortOrder: 2,
    },
    {
      contentKey: "site_welcome_message",
      contentType: "textarea",
      label: "رسالة الترحيب",
      value: "يا بعد القصيم كله… نورتناااا 🩵\nتطمن… جهازك جهازنا 📱\nكل تحديث على جهازك يوصلك أول بأول… بدون ما تحتاج تسأل احد 🫶🏻",
      defaultValue: "يا بعد القصيم كله… نورتناااا 🩵\nتطمن… جهازك جهازنا 📱\nكل تحديث على جهازك يوصلك أول بأول… بدون ما تحتاج تسأل احد 🫶🏻",
      description: "رسالة الترحيب الرئيسية",
      isGlobal: true,
      category: "messages",
      sortOrder: 1,
    },
    {
      contentKey: "site_footer_rights",
      contentType: "text",
      label: "حقوق الموقع",
      value: "جميع الحقوق محفوظة لدى وليد الزلفاوي",
      defaultValue: "جميع الحقوق محفوظة لدى وليد الزلفاوي",
      description: "نص حقوق الموقع",
      isGlobal: true,
      category: "general",
      sortOrder: 3,
    },
    {
      contentKey: "site_footer_contact_phone",
      contentType: "phone",
      label: "رقم التواصل",
      value: "0566515352",
      defaultValue: "0566515352",
      description: "رقم واتساب وليد",
      isGlobal: true,
      category: "contact",
      sortOrder: 1,
    },
    {
      contentKey: "site_footer_services_count",
      contentType: "text",
      label: "عدد الأجهزة المصلحة",
      value: "خدمنا اكثر من 7 آلاف جهاز صيانة بنجاح ومستمرررين 📱🩵",
      defaultValue: "خدمنا اكثر من 7 آلاف جهاز صيانة بنجاح ومستمرررين 📱🩵",
      description: "عبارة الإنجازات",
      isGlobal: true,
      category: "general",
      sortOrder: 4,
    },
  ];
  
  for (const item of defaultContent) {
    const existing = await db
      .select()
      .from(siteContent)
      .where(eq(siteContent.contentKey, item.contentKey))
      .limit(1);
    
    if (!existing[0]) {
      await db.insert(siteContent).values(item);
    }
  }
}
