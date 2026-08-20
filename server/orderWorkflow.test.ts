import { describe, expect, it } from "vitest";
import {
  buildApprovalUpdate,
  buildArchiveUpdate,
  buildStatusUpdate,
  findNextOrderNumber,
  getInvoiceTotals,
} from "./orderWorkflow";

describe("Order workflow transitions", () => {
  it("moves an approved price request to in progress", () => {
    const result = buildApprovalUpdate("approved", 1_700_000_000_000);
    expect(result).toEqual({
      priceApprovalStatus: "approved",
      approvalRespondedAt: 1_700_000_000_000,
      status: "in_progress",
      note: "وافق الزبون على السعر",
    });
  });

  it("moves a rejected price request to cancelled", () => {
    const result = buildApprovalUpdate("rejected", 1_700_000_000_000);
    expect(result.status).toBe("cancelled");
    expect(result.priceApprovalStatus).toBe("rejected");
  });

  it("records delivery and calculates the warranty expiration", () => {
    const now = 1_700_000_000_000;
    expect(buildStatusUpdate("delivered", 30, now)).toEqual({
      status: "delivered",
      deliveredAt: now,
      warrantyExpiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });
  });

  it("starts the warranty at delivery and leaves no expiration for no-warranty orders", () => {
    const now = 1_700_000_000_000;
    expect(buildStatusUpdate("delivered", 180, now)).toMatchObject({
      deliveredAt: now,
      warrantyExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
    });
    expect(buildStatusUpdate("delivered", 0, now)).toEqual({
      status: "delivered",
      deliveredAt: now,
      warrantyExpiresAt: null,
    });
  });

  it("keeps regular status transitions free of delivery metadata", () => {
    expect(buildStatusUpdate("ready", 30, 1_700_000_000_000)).toEqual({ status: "ready" });
  });

  it("supports archiving and restoring an order", () => {
    expect(buildArchiveUpdate(true, 123)).toEqual({ archived: true, archivedAt: 123 });
    expect(buildArchiveUpdate(false, 456)).toEqual({ archived: false, archivedAt: null });
  });
});

describe("Invoice totals", () => {
  it("calculates total, paid, and remaining amounts", () => {
    expect(getInvoiceTotals(50_000, 20_000)).toEqual({
      total: 50_000,
      paid: 20_000,
      remaining: 30_000,
    });
  });

  it("never returns a negative remaining balance", () => {
    expect(getInvoiceTotals(50_000, 60_000).remaining).toBe(0);
  });
});

describe("Order number sequence", () => {
  it("continues five existing orders with number 6", async () => {
    await expect(findNextOrderNumber(5, async () => false)).resolves.toBe("6");
  });

  it("skips a number that is already occupied", async () => {
    await expect(findNextOrderNumber(5, async candidate => candidate === "6")).resolves.toBe("7");
  });
});
