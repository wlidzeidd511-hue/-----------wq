import { and, desc, eq } from "drizzle-orm";
import { additionalRepairProposals, orderStatusHistory, serviceOrders } from "../drizzle/schema";
import { getDb } from "./db";

export async function listAdditionalRepairProposals(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(additionalRepairProposals).where(eq(additionalRepairProposals.orderId, orderId)).orderBy(desc(additionalRepairProposals.createdAt));
}

export async function listPendingAdditionalProposalOrders(branchId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ orderId: additionalRepairProposals.orderId })
    .from(additionalRepairProposals)
    .where(and(eq(additionalRepairProposals.branchId, branchId), eq(additionalRepairProposals.status, "pending")));
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.orderId, (counts.get(row.orderId) ?? 0) + 1);
  return Array.from(counts, ([orderId, pendingCount]) => ({ orderId, pendingCount }));
}

export async function listPublicAdditionalRepairProposals(publicToken: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [order] = await db.select({ id: serviceOrders.id }).from(serviceOrders).where(and(eq(serviceOrders.publicToken, publicToken), eq(serviceOrders.archived, false))).limit(1);
  if (!order) return undefined;
  return listAdditionalRepairProposals(order.id);
}

export async function listCustomerAdditionalRepairProposals(customerId: number, orderId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [order] = await db.select({ id: serviceOrders.id }).from(serviceOrders).where(and(eq(serviceOrders.id, orderId), eq(serviceOrders.customerId, customerId), eq(serviceOrders.archived, false))).limit(1);
  if (!order) return undefined;
  return listAdditionalRepairProposals(order.id);
}

export async function createAdditionalRepairProposal(input: {
  orderId: number;
  issue: string;
  description?: string | null;
  amount: number;
  createdByType?: "owner" | "staff";
  createdById?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select().from(serviceOrders).where(eq(serviceOrders.id, input.orderId)).limit(1);
  if (!order || order.archived || ["delivered", "cancelled"].includes(order.status)) return undefined;
  const now = Date.now();
  const inserted = await db.insert(additionalRepairProposals).values({
    orderId: order.id,
    branchId: order.branchId,
    customerId: order.customerId,
    issue: input.issue.trim(),
    description: input.description?.trim() || null,
    amount: input.amount,
    createdByType: input.createdByType ?? "owner",
    createdById: input.createdById ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const id = Number(inserted[0].insertId);
  const [proposal] = await db.select().from(additionalRepairProposals).where(eq(additionalRepairProposals.id, id)).limit(1);
  return { proposal, order };
}

export async function respondToAdditionalRepairProposal(input: {
  proposalId: number;
  decision: "approved" | "rejected";
  publicToken?: string;
  customerId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [current] = await db
    .select({ proposal: additionalRepairProposals, order: serviceOrders })
    .from(additionalRepairProposals)
    .innerJoin(serviceOrders, eq(additionalRepairProposals.orderId, serviceOrders.id))
    .where(eq(additionalRepairProposals.id, input.proposalId))
    .limit(1);
  if (!current || current.order.archived) return undefined;
  const allowed = input.customerId
    ? current.order.customerId === input.customerId
    : Boolean(input.publicToken && current.order.publicToken === input.publicToken);
  if (!allowed) return undefined;
  if (current.proposal.status !== "pending") return { ...current, newlyResponded: false };

  const now = Date.now();
  const updated = await db.update(additionalRepairProposals).set({
    status: input.decision,
    respondedAt: now,
    updatedAt: now,
  }).where(and(eq(additionalRepairProposals.id, current.proposal.id), eq(additionalRepairProposals.status, "pending")));
  const newlyResponded = (updated[0].affectedRows ?? 0) > 0;
  if (newlyResponded && input.decision === "approved") {
    const newPrice = current.order.price + current.proposal.amount;
    const paymentStatus = newPrice > 0 && current.order.amountPaid >= newPrice
      ? "paid" as const
      : current.order.amountPaid > 0
        ? "partial" as const
        : "unpaid" as const;
    await db.update(serviceOrders).set({ price: newPrice, paymentStatus }).where(eq(serviceOrders.id, current.order.id));
  }
  if (newlyResponded) {
    await db.insert(orderStatusHistory).values({
      orderId: current.order.id,
      fromStatus: current.order.status,
      toStatus: current.order.status,
      note: input.decision === "approved"
        ? `وافق العميل على ${current.proposal.issue} بتكلفة إضافية ${(current.proposal.amount / 100).toFixed(2)}`
        : `لم يوافق العميل على ${current.proposal.issue}`,
      visibleToCustomer: true,
      changedBy: "العميل",
      changedByType: "customer",
      changedById: current.order.customerId,
      createdAt: now,
    });
  }
  const [proposal] = await db.select().from(additionalRepairProposals).where(eq(additionalRepairProposals.id, current.proposal.id)).limit(1);
  const [order] = await db.select().from(serviceOrders).where(eq(serviceOrders.id, current.order.id)).limit(1);
  return { proposal, order, newlyResponded };
}
