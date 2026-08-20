import type { ServiceOrderStatus } from "../drizzle/schema";
import { calculateWarrantyExpiresAt } from "../shared/serviceUnits";

export function buildStatusUpdate(
  status: ServiceOrderStatus,
  warrantyDays: number,
  now = Date.now(),
) {
  if (status !== "delivered") return { status };
  return {
    status,
    deliveredAt: now,
    warrantyExpiresAt: calculateWarrantyExpiresAt(now, warrantyDays),
  };
}

export function buildApprovalUpdate(
  decision: "approved" | "rejected",
  now = Date.now(),
) {
  const status: ServiceOrderStatus = decision === "approved" ? "in_progress" : "cancelled";
  return {
    priceApprovalStatus: decision,
    approvalRespondedAt: now,
    status,
    note: decision === "approved" ? "وافق الزبون على السعر" : "رفض الزبون السعر",
  };
}

export function buildArchiveUpdate(archived: boolean, now = Date.now()) {
  return { archived, archivedAt: archived ? now : null };
}

export function getInvoiceTotals(price: number, amountPaid: number) {
  return {
    total: price,
    paid: amountPaid,
    remaining: Math.max(price - amountPaid, 0),
  };
}

export async function findNextOrderNumber(
  totalOrders: number,
  isTaken: (candidate: string) => Promise<boolean>,
) {
  let candidate = totalOrders + 1;
  while (await isTaken(String(candidate))) candidate += 1;
  return String(candidate);
}
