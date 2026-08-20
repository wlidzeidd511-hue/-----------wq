import { createHash } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { webPushDeliveries, webPushSubscriptions } from "../drizzle/schema";
import { getDb } from "./db";

export type BrowserPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

export type PushBindingContext = {
  source: "customer_account" | "order_tracking";
  branchId: number;
  customerId?: number | null;
  orderId?: number | null;
};

function hashEndpoint(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

function bindingKey(endpointHash: string, context: PushBindingContext) {
  return [context.source, context.branchId, context.customerId ?? 0, context.orderId ?? 0, endpointHash].join(":");
}

export async function upsertWebPushBinding(subscription: BrowserPushSubscription, context: PushBindingContext) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  const endpointHash = hashEndpoint(subscription.endpoint);
  const key = bindingKey(endpointHash, context);
  await db.insert(webPushSubscriptions).values({
    bindingKey: key,
    endpointHash,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    branchId: context.branchId,
    customerId: context.customerId ?? null,
    orderId: context.orderId ?? null,
    source: context.source,
    expirationTime: subscription.expirationTime ?? null,
    isActive: true,
    failureCount: 0,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  }).onDuplicateKeyUpdate({ set: {
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    expirationTime: subscription.expirationTime ?? null,
    isActive: true,
    failureCount: 0,
    failureReason: null,
    updatedAt: now,
  } });
  const [row] = await db.select().from(webPushSubscriptions).where(eq(webPushSubscriptions.bindingKey, key)).limit(1);
  return row;
}

export async function deactivateWebPushBindings(endpoint: string, scope: { customerId?: number; orderId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(webPushSubscriptions.endpointHash, hashEndpoint(endpoint))];
  if (scope.customerId) conditions.push(eq(webPushSubscriptions.customerId, scope.customerId));
  if (scope.orderId) conditions.push(eq(webPushSubscriptions.orderId, scope.orderId));
  await db.update(webPushSubscriptions).set({ isActive: false, updatedAt: Date.now() }).where(and(...conditions));
  return { success: true as const };
}

export async function listActivePushBindingsForOrder(order: { id: number; branchId: number; customerId: number | null }) {
  const db = await getDb();
  if (!db) return [];
  const target = order.customerId
    ? or(
        eq(webPushSubscriptions.orderId, order.id),
        and(eq(webPushSubscriptions.customerId, order.customerId), eq(webPushSubscriptions.branchId, order.branchId)),
      )
    : eq(webPushSubscriptions.orderId, order.id);
  const rows = await db.select().from(webPushSubscriptions).where(and(eq(webPushSubscriptions.isActive, true), target)).orderBy(desc(webPushSubscriptions.updatedAt));
  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!unique.has(row.endpointHash)) unique.set(row.endpointHash, row);
  return Array.from(unique.values());
}

export async function recordWebPushDelivery(input: {
  subscriptionId: number;
  orderId: number;
  branchId: number;
  eventType: string;
  title: string;
  status: "sent" | "failed" | "skipped";
  responseStatus?: number | null;
  failureReason?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  await db.insert(webPushDeliveries).values({
    ...input,
    responseStatus: input.responseStatus ?? null,
    failureReason: input.failureReason?.slice(0, 1000) ?? null,
    createdAt: now,
    sentAt: input.status === "sent" ? now : null,
  });
}

export async function markWebPushSuccess(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(webPushSubscriptions).set({ failureCount: 0, lastSuccessAt: Date.now(), failureReason: null, updatedAt: Date.now() }).where(eq(webPushSubscriptions.id, id));
}

export async function markWebPushFailure(id: number, reason: string, expired: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(webPushSubscriptions).set({
    failureCount: sql`${webPushSubscriptions.failureCount} + 1`,
    lastFailureAt: Date.now(),
    failureReason: reason.slice(0, 1000),
    isActive: expired ? false : sql`${webPushSubscriptions.isActive}`,
    updatedAt: Date.now(),
  }).where(eq(webPushSubscriptions.id, id));
}

