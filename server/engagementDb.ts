import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, notInArray, or } from "drizzle-orm";
import { branches, directMessageReceipts, directMessages, presenceSessions, serviceOrders } from "../drizzle/schema";
import { getDb } from "./db";
import { writeAuditLog } from "./platformDb";

export async function recordPresence(input: {
  sessionKey: string;
  branchId?: number | null;
  customerId?: number | null;
  orderId?: number | null;
  currentPath: string;
  displayLabel: string;
  userAgentHash?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  await db.insert(presenceSessions).values({
    sessionKey: input.sessionKey,
    branchId: input.branchId ?? null,
    customerId: input.customerId ?? null,
    orderId: input.orderId ?? null,
    currentPath: input.currentPath,
    displayLabel: input.displayLabel,
    userAgentHash: input.userAgentHash ?? null,
    lastSeenAt: now,
    createdAt: now,
  }).onDuplicateKeyUpdate({ set: {
    branchId: input.branchId ?? null,
    customerId: input.customerId ?? null,
    orderId: input.orderId ?? null,
    currentPath: input.currentPath,
    displayLabel: input.displayLabel,
    userAgentHash: input.userAgentHash ?? null,
    lastSeenAt: now,
  } });
  return { success: true as const, lastSeenAt: now };
}

export async function listOnlinePresence(branchId?: number, activeWithinMs = 90_000) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [gt(presenceSessions.lastSeenAt, Date.now() - activeWithinMs)];
  if (branchId) conditions.push(eq(presenceSessions.branchId, branchId));
  const sessions = await db
    .select({
      id: presenceSessions.id,
      sessionKey: presenceSessions.sessionKey,
      branchId: presenceSessions.branchId,
      customerId: presenceSessions.customerId,
      orderId: presenceSessions.orderId,
      currentPath: presenceSessions.currentPath,
      displayLabel: presenceSessions.displayLabel,
      lastSeenAt: presenceSessions.lastSeenAt,
      createdAt: presenceSessions.createdAt,
      orderBarcode: serviceOrders.barcode,
      deviceInfo: serviceOrders.deviceInfo,
      serviceType: serviceOrders.serviceType,
      customerName: serviceOrders.customerName,
      customerPhone: serviceOrders.customerPhone,
      branchName: branches.name,
    })
    .from(presenceSessions)
    .leftJoin(serviceOrders, eq(presenceSessions.orderId, serviceOrders.id))
    .leftJoin(branches, eq(presenceSessions.branchId, branches.id))
    .where(and(...conditions))
    .orderBy(desc(presenceSessions.lastSeenAt));

  const customerIds = Array.from(new Set(sessions.map(session => session.customerId).filter((id): id is number => id !== null)));
  const orderIds = Array.from(new Set(sessions.map(session => session.orderId).filter((id): id is number => id !== null)));
  const identityConditions = [];
  if (customerIds.length) identityConditions.push(inArray(serviceOrders.customerId, customerIds));
  if (orderIds.length) identityConditions.push(inArray(serviceOrders.id, orderIds));
  if (!identityConditions.length) return sessions.map(session => ({ ...session, customerKind: "general" as const, invoices: [] }));

  const invoiceConditions = [
    or(...identityConditions)!,
    eq(serviceOrders.archived, false),
    notInArray(serviceOrders.status, ["delivered", "cancelled"]),
    isNull(serviceOrders.deliveredAt),
  ];
  if (branchId) invoiceConditions.push(eq(serviceOrders.branchId, branchId));
  const invoices = await db
    .select({
      id: serviceOrders.id,
      customerId: serviceOrders.customerId,
      branchId: serviceOrders.branchId,
      barcode: serviceOrders.barcode,
      deviceInfo: serviceOrders.deviceInfo,
      serviceType: serviceOrders.serviceType,
      status: serviceOrders.status,
      customerName: serviceOrders.customerName,
      customerPhone: serviceOrders.customerPhone,
      branchName: branches.name,
      createdAt: serviceOrders.createdAt,
    })
    .from(serviceOrders)
    .leftJoin(branches, eq(serviceOrders.branchId, branches.id))
    .where(and(...invoiceConditions))
    .orderBy(desc(serviceOrders.createdAt));

  return sessions.map(session => {
    const relatedInvoices = invoices.filter(invoice => (
      session.customerId !== null
        ? invoice.customerId === session.customerId
        : invoice.id === session.orderId
    ));
    return {
      ...session,
      customerKind: relatedInvoices.length ? "known" as const : "general" as const,
      invoices: relatedInvoices,
    };
  });
}

export async function createDirectMessage(input: {
  branchId?: number | null;
  customerId?: number | null;
  orderId?: number | null;
  targetSessionKey?: string | null;
  audience: "customer" | "visitor" | "branch_online" | "all_online";
  title?: string | null;
  body: string;
  createdById?: number | null;
  expiresAt?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(directMessages).values({
    branchId: input.branchId ?? null,
    customerId: input.customerId ?? null,
    orderId: input.orderId ?? null,
    targetSessionKey: input.targetSessionKey ?? null,
    audience: input.audience,
    title: input.title ?? null,
    body: input.body,
    createdByType: "owner",
    createdById: input.createdById ?? null,
    expiresAt: input.expiresAt ?? Date.now() + 24 * 60 * 60 * 1000,
    createdAt: Date.now(),
  });
  const id = Number(result[0].insertId);
  await writeAuditLog(
    { type: "owner", branchId: input.branchId },
    "direct_message.created",
    "direct_message",
    id,
    { audience: input.audience, customerId: input.customerId ?? null, orderId: input.orderId ?? null, targetedVisitor: Boolean(input.targetSessionKey) },
  );
  return { id };
}

export async function getPresenceRecipient(sessionKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [recipient] = await db
    .select({
      sessionKey: presenceSessions.sessionKey,
      branchId: presenceSessions.branchId,
      customerId: presenceSessions.customerId,
      orderId: presenceSessions.orderId,
      lastSeenAt: presenceSessions.lastSeenAt,
      orderBarcode: serviceOrders.barcode,
      deviceInfo: serviceOrders.deviceInfo,
      serviceType: serviceOrders.serviceType,
      customerName: serviceOrders.customerName,
      customerPhone: serviceOrders.customerPhone,
      branchName: branches.name,
    })
    .from(presenceSessions)
    .leftJoin(serviceOrders, eq(presenceSessions.orderId, serviceOrders.id))
    .leftJoin(branches, eq(presenceSessions.branchId, branches.id))
    .where(eq(presenceSessions.sessionKey, sessionKey))
    .limit(1);
  return recipient;
}

export async function listSentDirectMessages(branchId?: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: directMessages.id,
      audience: directMessages.audience,
      title: directMessages.title,
      body: directMessages.body,
      createdAt: directMessages.createdAt,
      orderId: directMessages.orderId,
      orderBarcode: serviceOrders.barcode,
      deviceInfo: serviceOrders.deviceInfo,
      customerName: serviceOrders.customerName,
      branchName: branches.name,
    })
    .from(directMessages)
    .leftJoin(serviceOrders, eq(directMessages.orderId, serviceOrders.id))
    .leftJoin(branches, eq(directMessages.branchId, branches.id))
    .where(branchId ? eq(directMessages.branchId, branchId) : undefined)
    .orderBy(desc(directMessages.createdAt))
    .limit(Math.max(1, Math.min(limit, 200)));
}

export async function getDirectMessages(input: {
  afterId?: number;
  branchId?: number | null;
  customerId?: number | null;
  orderId?: number | null;
  sessionKey?: string | null;
}) {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  const audience = [eq(directMessages.audience, "all_online")];
  if (input.branchId) audience.push(and(eq(directMessages.audience, "branch_online"), eq(directMessages.branchId, input.branchId))!);
  if (input.orderId) audience.push(and(eq(directMessages.audience, "customer"), eq(directMessages.orderId, input.orderId))!);
  else if (input.customerId) audience.push(and(eq(directMessages.audience, "customer"), eq(directMessages.customerId, input.customerId))!);
  if (input.sessionKey) audience.push(and(eq(directMessages.audience, "visitor"), eq(directMessages.targetSessionKey, input.sessionKey))!);
  const conditions = [or(...audience)!, or(isNull(directMessages.expiresAt), gt(directMessages.expiresAt, now))!];
  if (input.afterId) conditions.push(gt(directMessages.id, input.afterId));
  const candidates = await db
    .select({
      id: directMessages.id,
      branchId: directMessages.branchId,
      customerId: directMessages.customerId,
      orderId: directMessages.orderId,
      targetSessionKey: directMessages.targetSessionKey,
      audience: directMessages.audience,
      title: directMessages.title,
      body: directMessages.body,
      createdAt: directMessages.createdAt,
    })
    .from(directMessages)
    .where(and(...conditions))
    .orderBy(asc(directMessages.id))
    .limit(20);

  const keyedCandidates = candidates
    .map(message => ({ message, recipientKey: directMessageRecipientKey(message, input) }))
    .filter((entry): entry is { message: (typeof candidates)[number]; recipientKey: string } => Boolean(entry.recipientKey));
  if (!keyedCandidates.length) return [];
  const receipts = await db
    .select({ messageId: directMessageReceipts.messageId, recipientKey: directMessageReceipts.recipientKey })
    .from(directMessageReceipts)
    .where(and(
      inArray(directMessageReceipts.messageId, keyedCandidates.map(entry => entry.message.id)),
      inArray(directMessageReceipts.recipientKey, Array.from(new Set(keyedCandidates.map(entry => entry.recipientKey)))),
    ));
  const seen = new Set(receipts.map(receipt => `${receipt.messageId}:${receipt.recipientKey}`));
  return keyedCandidates
    .filter(entry => !seen.has(`${entry.message.id}:${entry.recipientKey}`))
    .map(({ message }) => ({ id: message.id, title: message.title, body: message.body, createdAt: message.createdAt }));
}

type DirectMessageIdentity = {
  branchId?: number | null;
  customerId?: number | null;
  orderId?: number | null;
  sessionKey?: string | null;
};

type DirectMessageTarget = {
  branchId: number | null;
  customerId: number | null;
  orderId: number | null;
  targetSessionKey: string | null;
  audience: "customer" | "visitor" | "branch_online" | "all_online";
};

function sessionRecipientKey(sessionKey: string) {
  return `session:${createHash("sha256").update(sessionKey).digest("hex")}`;
}

function directMessageRecipientKey(message: DirectMessageTarget, identity: DirectMessageIdentity) {
  if (message.audience === "visitor") return identity.sessionKey ? sessionRecipientKey(identity.sessionKey) : null;
  if (message.audience === "customer") {
    if (message.orderId !== null && identity.orderId !== null && identity.orderId !== undefined && identity.orderId !== message.orderId) return null;
    if (message.customerId && (identity.customerId === message.customerId || (message.orderId !== null && identity.orderId === message.orderId))) return `customer:${message.customerId}`;
    if (message.orderId) return identity.orderId === message.orderId ? `order:${message.orderId}` : null;
    return null;
  }
  if (identity.customerId) return `customer:${identity.customerId}`;
  if (identity.orderId) return `order:${identity.orderId}`;
  return identity.sessionKey ? sessionRecipientKey(identity.sessionKey) : null;
}

function directMessageMatchesIdentity(message: DirectMessageTarget & { expiresAt: number | null }, identity: DirectMessageIdentity) {
  if (message.expiresAt !== null && message.expiresAt <= Date.now()) return false;
  if (message.audience === "all_online") return true;
  if (message.audience === "branch_online") return Boolean(identity.branchId && message.branchId === identity.branchId);
  if (message.audience === "visitor") return Boolean(identity.sessionKey && message.targetSessionKey === identity.sessionKey);
  if (message.orderId) {
    if (identity.orderId !== null && identity.orderId !== undefined) return identity.orderId === message.orderId;
    return Boolean(identity.customerId && message.customerId === identity.customerId);
  }
  return Boolean(identity.customerId && message.customerId === identity.customerId);
}

export async function acknowledgeDirectMessage(messageId: number, identity: DirectMessageIdentity) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [message] = await db
    .select({
      branchId: directMessages.branchId,
      customerId: directMessages.customerId,
      orderId: directMessages.orderId,
      targetSessionKey: directMessages.targetSessionKey,
      audience: directMessages.audience,
      expiresAt: directMessages.expiresAt,
    })
    .from(directMessages)
    .where(eq(directMessages.id, messageId))
    .limit(1);
  if (!message || !directMessageMatchesIdentity(message, identity)) return { success: false as const };
  const recipientKey = directMessageRecipientKey(message, identity);
  if (!recipientKey) return { success: false as const };
  const seenAt = Date.now();
  await db.insert(directMessageReceipts).values({ messageId, recipientKey, seenAt }).onDuplicateKeyUpdate({ set: { seenAt } });
  return { success: true as const, seenAt };
}
