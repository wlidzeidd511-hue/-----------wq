import { and, count, countDistinct, eq, gt, isNotNull } from "drizzle-orm";
import { customers, presenceSessions, serviceOrders, staffAccounts } from "../drizzle/schema";
import { getDb } from "./db";

export type OwnerOverviewMetrics = {
  completedMaintenanceDevices: number;
  lifetimeVisitors: number;
  onlineVisitors: number;
  customerAccounts: number;
  activeStaffAccounts: number;
  totalAccounts: number;
};

function numeric(value: unknown) {
  return Number(value ?? 0);
}

export async function getOwnerOverviewMetrics(branchId: number): Promise<OwnerOverviewMetrics> {
  const db = await getDb();
  if (!db) {
    return {
      completedMaintenanceDevices: 0,
      lifetimeVisitors: 0,
      onlineVisitors: 0,
      customerAccounts: 0,
      activeStaffAccounts: 0,
      totalAccounts: 0,
    };
  }

  const activeSince = Date.now() - 90_000;
  const [completedRows, lifetimeRows, onlineRows, customerRows, staffRows] = await Promise.all([
    db
      .select({ value: count(serviceOrders.id) })
      .from(serviceOrders)
      .where(and(
        eq(serviceOrders.branchId, branchId),
        eq(serviceOrders.serviceType, "maintenance"),
        eq(serviceOrders.status, "delivered"),
      )),
    db
      .select({ value: count(presenceSessions.id) })
      .from(presenceSessions)
      .where(eq(presenceSessions.branchId, branchId)),
    db
      .select({ value: count(presenceSessions.id) })
      .from(presenceSessions)
      .where(and(eq(presenceSessions.branchId, branchId), gt(presenceSessions.lastSeenAt, activeSince))),
    db
      .select({ value: countDistinct(customers.id) })
      .from(customers)
      .innerJoin(serviceOrders, eq(serviceOrders.customerId, customers.id))
      .where(and(eq(serviceOrders.branchId, branchId), isNotNull(serviceOrders.customerId), eq(customers.isActive, true))),
    db
      .select({ value: count(staffAccounts.id) })
      .from(staffAccounts)
      .where(and(eq(staffAccounts.branchId, branchId), eq(staffAccounts.isActive, true))),
  ]);

  const customerAccounts = numeric(customerRows[0]?.value);
  const activeStaffAccounts = numeric(staffRows[0]?.value);
  return {
    completedMaintenanceDevices: numeric(completedRows[0]?.value),
    lifetimeVisitors: numeric(lifetimeRows[0]?.value),
    onlineVisitors: numeric(onlineRows[0]?.value),
    customerAccounts,
    activeStaffAccounts,
    totalAccounts: customerAccounts + activeStaffAccounts,
  };
}
