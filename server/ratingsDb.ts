import { and, desc, eq } from "drizzle-orm";
import { branchSettings, branches, serviceOrders, serviceRatings } from "../drizzle/schema";
import { getDb } from "./db";

async function ratingContext(orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .select({
      orderId: serviceOrders.id,
      branchId: serviceOrders.branchId,
      customerId: serviceOrders.customerId,
      barcode: serviceOrders.barcode,
      status: serviceOrders.status,
      archived: serviceOrders.archived,
      branchName: branches.name,
      mapsReviewUrl: branchSettings.mapsReviewUrl,
      mapUrl: branchSettings.mapUrl,
    })
    .from(serviceOrders)
    .innerJoin(branches, eq(serviceOrders.branchId, branches.id))
    .leftJoin(branchSettings, eq(branchSettings.branchId, serviceOrders.branchId))
    .where(eq(serviceOrders.id, orderId))
    .limit(1);
  if (!row) return undefined;
  const [rating] = await db.select().from(serviceRatings).where(eq(serviceRatings.orderId, orderId)).limit(1);
  return {
    order: { id: row.orderId, branchId: row.branchId, customerId: row.customerId, barcode: row.barcode, status: row.status },
    branch: { id: row.branchId, name: row.branchName, reviewUrl: row.mapsReviewUrl || row.mapUrl || null },
    rating: rating ?? null,
    eligible: row.status === "delivered" && !row.archived,
  };
}

export async function getPublicRatingContext(publicToken: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select({ id: serviceOrders.id }).from(serviceOrders).where(eq(serviceOrders.publicToken, publicToken)).limit(1);
  return order ? ratingContext(order.id) : undefined;
}

export async function getCustomerRatingContext(customerId: number, orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select({ id: serviceOrders.id }).from(serviceOrders).where(and(eq(serviceOrders.id, orderId), eq(serviceOrders.customerId, customerId))).limit(1);
  return order ? ratingContext(order.id) : undefined;
}

export async function submitServiceRating(input: {
  orderId: number;
  stars: number;
  feedback?: string | null;
  contactBranchId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const context = await ratingContext(input.orderId);
  if (!context?.eligible) return undefined;
  if (context.rating) return { ...context, newlyCreated: false };
  let contactBranchId: number | null = null;
  if (input.contactBranchId) {
    const [contactBranch] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.id, input.contactBranchId), eq(branches.isActive, true))).limit(1);
    contactBranchId = contactBranch?.id ?? null;
  }
  const now = Date.now();
  try {
    await db.insert(serviceRatings).values({
      branchId: context.order.branchId,
      orderId: context.order.id,
      customerId: context.order.customerId,
      stars: input.stars,
      feedback: input.feedback?.trim() || null,
      contactBranchId,
      contactRequestedAt: input.stars < 5 && contactBranchId ? now : null,
      googleRedirectShown: false,
      createdAt: now,
    });
  } catch {
    const existing = await ratingContext(input.orderId);
    if (existing?.rating) return { ...existing, newlyCreated: false };
    throw new Error("Unable to save rating");
  }
  const saved = await ratingContext(input.orderId);
  return saved ? { ...saved, newlyCreated: true } : undefined;
}

export async function markGoogleReviewShown(orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(serviceRatings).set({ googleRedirectShown: true }).where(and(eq(serviceRatings.orderId, orderId), eq(serviceRatings.stars, 5)));
  return ratingContext(orderId);
}

export async function listServiceRatings(branchId?: number) {
  const db = await getDb();
  if (!db) return { ratings: [], count: 0, averageStars: 0 };
  const where = branchId ? eq(serviceRatings.branchId, branchId) : undefined;
  const rows = await db
    .select({
      id: serviceRatings.id,
      orderId: serviceRatings.orderId,
      branchId: serviceRatings.branchId,
      stars: serviceRatings.stars,
      feedback: serviceRatings.feedback,
      contactBranchId: serviceRatings.contactBranchId,
      contactRequestedAt: serviceRatings.contactRequestedAt,
      googleRedirectShown: serviceRatings.googleRedirectShown,
      createdAt: serviceRatings.createdAt,
      barcode: serviceOrders.barcode,
      customerName: serviceOrders.customerName,
      deviceInfo: serviceOrders.deviceInfo,
      branchName: branches.name,
    })
    .from(serviceRatings)
    .innerJoin(serviceOrders, eq(serviceRatings.orderId, serviceOrders.id))
    .innerJoin(branches, eq(serviceRatings.branchId, branches.id))
    .where(where)
    .orderBy(desc(serviceRatings.createdAt));
  const count = rows.length;
  return { ratings: rows, count, averageStars: count ? rows.reduce((sum, row) => sum + row.stars, 0) / count : 0 };
}
