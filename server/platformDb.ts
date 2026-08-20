import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import {
  auditLogs,
  branchContent,
  branchSettings,
  branches,
  notificationMessages,
  popupCategorySettings,
  popupMessages,
  serviceOrders,
  type PopupMessageCategory,
  whatsappTemplates,
} from "../drizzle/schema";
import { getDb } from "./db";
import { createAuditIntegrityHash, verifyAuditIntegrity } from "./auditIntegrity";

export type AuditActor = {
  type: "owner" | "staff" | "customer" | "system";
  id?: number | null;
  branchId?: number | null;
};

export async function writeAuditLog(
  actor: AuditActor,
  action: string,
  entityType: string,
  entityId?: string | number | null,
  metadata?: Record<string, unknown>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const createdAt = Date.now();
  const row = {
    branchId: actor.branchId ?? null,
    actorType: actor.type,
    actorId: actor.id ?? null,
    action,
    entityType,
    entityId: entityId == null ? null : String(entityId),
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt,
  };
  await db.insert(auditLogs).values({ ...row, integrityHash: createAuditIntegrityHash(row) });
}

export async function listBranches(includeInactive = false) {
  const db = await getDb();
  if (!db) return [];
  const branchRows = await db
    .select()
    .from(branches)
    .where(includeInactive ? undefined : eq(branches.isActive, true))
    .orderBy(asc(branches.sortOrder), asc(branches.id));
  const settingsRows = await db.select().from(branchSettings);
  const settingsByBranch = new Map(settingsRows.map(row => [row.branchId, row]));
  return branchRows.map(branch => ({ ...branch, settings: settingsByBranch.get(branch.id) ?? null }));
}

export async function getBranchById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [branch] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  if (!branch) return undefined;
  const [settings] = await db
    .select()
    .from(branchSettings)
    .where(eq(branchSettings.branchId, id))
    .limit(1);
  return { ...branch, settings: settings ?? null };
}

export async function createBranch(input: {
  name: string;
  slug: string;
  code: string;
  sortOrder?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(branches).values({
    name: input.name,
    slug: input.slug,
    code: input.code.toUpperCase(),
    sortOrder: input.sortOrder ?? 0,
  });
  const id = Number(result[0].insertId);
  await db.insert(branchSettings).values({
    branchId: id,
    displayName: `هاتف التميز - ${input.name}`,
    invoicePrefix: input.code.toUpperCase(),
  });
  await writeAuditLog({ type: "owner", branchId: id }, "branch.created", "branch", id, {
    name: input.name,
  });
  return getBranchById(id);
}

export async function updateBranch(
  id: number,
  input: Partial<{ name: string; slug: string; code: string; isActive: boolean; sortOrder: number }>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values = { ...input, code: input.code?.toUpperCase() };
  await db.update(branches).set(values).where(eq(branches.id, id));
  await writeAuditLog({ type: "owner", branchId: id }, "branch.updated", "branch", id, values);
  return getBranchById(id);
}

export async function updateBranchSettings(
  branchId: number,
  input: Partial<{
    displayName: string | null;
    phone: string | null;
    whatsappPhone: string | null;
    address: string | null;
    mapUrl: string | null;
    mapsReviewUrl: string | null;
    openingHours: string | null;
    warrantyPolicy: string | null;
    currency: string;
    invoicePrefix: string | null;
    waitingScreenEnabled: boolean;
    whatsappEnabled: boolean;
    whatsappPhoneNumberId: string | null;
  }>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(branchSettings)
    .values({ branchId, ...input })
    .onDuplicateKeyUpdate({ set: input });
  await writeAuditLog({ type: "owner", branchId }, "branch.settings.updated", "branch", branchId, {
    fields: Object.keys(input),
  });
  return getBranchById(branchId);
}

export async function getPublicWaitingScreen(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.slug, slug), eq(branches.isActive, true)))
    .limit(1);
  if (!branch) return undefined;
  const [settings] = await db.select().from(branchSettings).where(eq(branchSettings.branchId, branch.id)).limit(1);
  const [content] = await db
    .select()
    .from(branchContent)
    .where(and(eq(branchContent.branchId, branch.id), eq(branchContent.contentType, "waiting_screen")))
    .orderBy(asc(branchContent.sortOrder), asc(branchContent.id))
    .limit(1);
  return {
    branch,
    settings: settings ?? null,
    content: content ?? {
      id: 0,
      branchId: branch.id,
      contentType: "waiting_screen" as const,
      title: "جهازك عندنا بعيوننا 🩵",
      body: "رحلة جهازك واضحة… من أول دقيقة إلى لحظة التسليم.",
      mediaUrl: null,
      isActive: true,
      sortOrder: 0,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    },
  };
}

export async function getOwnerWaitingScreen(branchId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const branch = await getBranchById(branchId);
  if (!branch) return undefined;
  const [content] = await db
    .select()
    .from(branchContent)
    .where(and(eq(branchContent.branchId, branchId), eq(branchContent.contentType, "waiting_screen")))
    .orderBy(asc(branchContent.id))
    .limit(1);
  return {
    branch,
    content: content ?? {
      id: 0,
      branchId,
      contentType: "waiting_screen" as const,
      title: "جهازك عندنا بعيوننا 🩵",
      body: "رحلة جهازك واضحة… من أول دقيقة إلى لحظة التسليم.",
      mediaUrl: null,
      isActive: true,
      sortOrder: 0,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    },
  };
}

export async function updateWaitingScreenContent(branchId: number, input: { title: string; body: string; isActive: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db
    .select({ id: branchContent.id })
    .from(branchContent)
    .where(and(eq(branchContent.branchId, branchId), eq(branchContent.contentType, "waiting_screen")))
    .orderBy(asc(branchContent.id))
    .limit(1);
  if (existing) {
    await db.update(branchContent).set(input).where(eq(branchContent.id, existing.id));
  } else {
    await db.insert(branchContent).values({ branchId, contentType: "waiting_screen", ...input });
  }
  await writeAuditLog({ type: "owner", branchId }, "branch.waiting_screen.updated", "branch", branchId, { isActive: input.isActive });
  return getOwnerWaitingScreen(branchId);
}

export async function listPopupMessages(filters: {
  branchId?: number | null;
  category?: PopupMessageCategory;
  includeInactive?: boolean;
} = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.branchId === null) conditions.push(isNull(popupMessages.branchId));
  if (typeof filters.branchId === "number") conditions.push(eq(popupMessages.branchId, filters.branchId));
  if (filters.category) conditions.push(eq(popupMessages.category, filters.category));
  if (!filters.includeInactive) conditions.push(eq(popupMessages.isActive, true));
  return db
    .select()
    .from(popupMessages)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(popupMessages.category), asc(popupMessages.id));
}

export async function getRandomPopupMessage(input: {
  branchId?: number;
  category: PopupMessageCategory;
  excludeId?: number;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const settingScope = input.branchId
    ? or(isNull(popupCategorySettings.branchId), eq(popupCategorySettings.branchId, input.branchId))
    : isNull(popupCategorySettings.branchId);
  const settings = await db
    .select()
    .from(popupCategorySettings)
    .where(and(settingScope, eq(popupCategorySettings.category, input.category)));
  const globalSetting = settings.find(row => row.branchId === null);
  const branchSetting = input.branchId ? settings.find(row => row.branchId === input.branchId) : undefined;
  if (globalSetting?.isActive === false || branchSetting?.isActive === false) return undefined;
  const scope = input.branchId
    ? or(isNull(popupMessages.branchId), eq(popupMessages.branchId, input.branchId))
    : isNull(popupMessages.branchId);
  const rows = await db
    .select()
    .from(popupMessages)
    .where(and(scope, eq(popupMessages.category, input.category), eq(popupMessages.isActive, true)));
  const eligible = rows.filter(row => row.id !== input.excludeId || rows.length === 1);
  const weighted = eligible.flatMap(row => Array.from({ length: Math.max(1, Math.min(row.weight, 20)) }, () => row));
  if (!weighted.length) return undefined;
  return weighted[Math.floor(Math.random() * weighted.length)];
}

export async function listPopupCategorySettings() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(popupCategorySettings)
    .orderBy(asc(popupCategorySettings.category), asc(popupCategorySettings.branchId));
}

export async function setPopupCategoryState(input: {
  branchId?: number | null;
  category: PopupMessageCategory;
  isActive: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const branchId = input.branchId ?? null;
  const scopeKey = `${branchId == null ? "global" : `branch:${branchId}`}:${input.category}`;
  await db
    .insert(popupCategorySettings)
    .values({ scopeKey, branchId, category: input.category, isActive: input.isActive })
    .onDuplicateKeyUpdate({ set: { isActive: input.isActive, branchId, category: input.category } });
  await writeAuditLog(
    { type: "owner", branchId },
    "popup.category.updated",
    "popup_category",
    scopeKey,
    { category: input.category, isActive: input.isActive },
  );
  const [saved] = await db
    .select()
    .from(popupCategorySettings)
    .where(eq(popupCategorySettings.scopeKey, scopeKey))
    .limit(1);
  return saved;
}

export async function createPopupMessage(input: {
  branchId?: number | null;
  category: PopupMessageCategory;
  message: string;
  weight?: number;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(popupMessages).values({
    branchId: input.branchId ?? null,
    category: input.category,
    message: input.message,
    weight: input.weight ?? 1,
    isActive: input.isActive ?? true,
  });
  const id = Number(result[0].insertId);
  await writeAuditLog({ type: "owner", branchId: input.branchId }, "popup.created", "popup_message", id);
  return id;
}

export async function updatePopupMessage(
  id: number,
  input: Partial<{
    branchId: number | null;
    category: PopupMessageCategory;
    message: string;
    weight: number;
    isActive: boolean;
  }>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(popupMessages).set(input).where(eq(popupMessages.id, id));
  await writeAuditLog({ type: "owner", branchId: input.branchId }, "popup.updated", "popup_message", id, {
    fields: Object.keys(input),
  });
  return id;
}

export async function getPopupMessageBranchId(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select({ branchId: popupMessages.branchId }).from(popupMessages).where(eq(popupMessages.id, id)).limit(1);
  return row?.branchId;
}

export async function deletePopupMessage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(popupMessages).where(eq(popupMessages.id, id));
  await writeAuditLog({ type: "owner" }, "popup.deleted", "popup_message", id);
  return { success: true as const };
}

export async function listWhatsappTemplates(branchId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const condition = branchId === null
    ? isNull(whatsappTemplates.branchId)
    : typeof branchId === "number"
      ? or(isNull(whatsappTemplates.branchId), eq(whatsappTemplates.branchId, branchId))
      : undefined;
  const rows = await db.select().from(whatsappTemplates).where(condition).orderBy(asc(whatsappTemplates.eventType));
  if (typeof branchId !== "number") return rows;
  const byEvent = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const current = byEvent.get(row.eventType);
    if (!current || row.branchId === branchId) byEvent.set(row.eventType, row);
  }
  return Array.from(byEvent.values()).sort((a, b) => a.eventType.localeCompare(b.eventType));
}

export async function getWhatsappTemplate(branchId: number | null | undefined, eventType: string) {
  const db = await getDb();
  if (!db) return undefined;
  const scope = branchId
    ? or(eq(whatsappTemplates.branchId, branchId), isNull(whatsappTemplates.branchId))
    : isNull(whatsappTemplates.branchId);
  const rows = await db
    .select()
    .from(whatsappTemplates)
    .where(and(scope, eq(whatsappTemplates.eventType, eventType), eq(whatsappTemplates.isActive, true)));
  return rows.find(row => row.branchId === branchId) ?? rows.find(row => row.branchId === null);
}

export async function updateWhatsappTemplate(
  id: number,
  input: Partial<{
    branchId: number | null;
    templateName: string | null;
    languageCode: string;
    bodyPreview: string;
    isActive: boolean;
  }>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(whatsappTemplates).set(input).where(eq(whatsappTemplates.id, id));
  await writeAuditLog({ type: "owner", branchId: input.branchId }, "whatsapp.template.updated", "whatsapp_template", id, {
    fields: Object.keys(input),
  });
  return id;
}

export async function getWhatsappTemplateBranchId(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select({ branchId: whatsappTemplates.branchId }).from(whatsappTemplates).where(eq(whatsappTemplates.id, id)).limit(1);
  return row?.branchId;
}

export async function listWhatsappQueue(branchId?: number, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(notificationMessages.channel, "whatsapp")];
  if (branchId) conditions.push(eq(notificationMessages.branchId, branchId));
  return db
    .select({
      id: notificationMessages.id,
      orderId: notificationMessages.orderId,
      branchId: notificationMessages.branchId,
      customerId: notificationMessages.customerId,
      eventType: notificationMessages.eventType,
      templateKey: notificationMessages.templateKey,
      recipient: notificationMessages.recipient,
      message: notificationMessages.message,
      status: notificationMessages.status,
      failureReason: notificationMessages.failureReason,
      createdAt: notificationMessages.createdAt,
      sentAt: notificationMessages.sentAt,
      orderBarcode: serviceOrders.barcode,
      customerName: serviceOrders.customerName,
    })
    .from(notificationMessages)
    .leftJoin(serviceOrders, eq(notificationMessages.orderId, serviceOrders.id))
    .where(and(...conditions))
    .orderBy(desc(notificationMessages.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function markWhatsappManuallySent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [message] = await db.select().from(notificationMessages).where(eq(notificationMessages.id, id)).limit(1);
  if (!message) return undefined;
  await db
    .update(notificationMessages)
    .set({ status: "sent", sentAt: Date.now(), failureReason: "تم الإرسال يدويًا من لوحة المالك" })
    .where(eq(notificationMessages.id, id));
  await writeAuditLog(
    { type: "owner", branchId: message.branchId },
    "whatsapp.manual.sent",
    "notification_message",
    id,
  );
  return { success: true as const };
}

export async function getWhatsappQueueMessageBranchId(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select({ branchId: notificationMessages.branchId }).from(notificationMessages).where(eq(notificationMessages.id, id)).limit(1);
  return row?.branchId;
}

export async function listAuditLogs(branchId?: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(auditLogs)
    .where(branchId ? eq(auditLogs.branchId, branchId) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
  return rows.map(row => ({
    ...row,
    integrityStatus: verifyAuditIntegrity({
      branchId: row.branchId,
      actorType: row.actorType,
      actorId: row.actorId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      createdAt: row.createdAt,
    }, row.integrityHash),
  }));
}
