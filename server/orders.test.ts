import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { hashOwnerPassword, verifyOwnerPassword } from "./adminAuth";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

function baseContext(): Pick<TrpcContext, "req" | "res" | "user"> {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function publicContext(): TrpcContext {
  return { ...baseContext(), ownerSession: null };
}

async function ownerContext(): Promise<TrpcContext> {
  const settings = await getShopSettings();
  return {
    ...baseContext(),
    ownerSession: { kind: "owner", sessionVersion: settings.sessionVersion },
    branchSession: await currentBranchSession(1),
  };
}

describe("Owner authentication boundary", () => {
  it("rejects access to the owner order list without an owner session", async () => {
    const caller = appRouter.createCaller(publicContext());
    await expect(caller.orders.getAll()).rejects.toThrow("OWNER_AUTH_REQUIRED");
  });

  it("rejects owner mutations without an owner session", async () => {
    const caller = appRouter.createCaller(publicContext());
    await expect(caller.orders.archive({ id: 1, archived: true })).rejects.toThrow(
      "OWNER_AUTH_REQUIRED",
    );
  });

  it("allows a current owner session to read orders and reports", async () => {
    const caller = appRouter.createCaller(await ownerContext());
    const [orders, report] = await Promise.all([
      caller.orders.getAll(),
      caller.orders.report(),
    ]);

    expect(Array.isArray(orders)).toBe(true);
    expect(report).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        active: expect.any(Number),
        ready: expect.any(Number),
        averageCompletionMs: expect.any(Number),
        averageWaitBeforeWorkMs: expect.any(Number),
        completionSampleSize: expect.any(Number),
        waitSampleSize: expect.any(Number),
      }),
    );
    expect(report).not.toHaveProperty("revenue");
    expect(report).not.toHaveProperty("profit");
    expect(report).not.toHaveProperty("cost");
  });
});

describe("Customer tracking boundary", () => {
  it("allows public tracking requests without revealing a missing order", async () => {
    const caller = appRouter.createCaller(publicContext());
    const result = await caller.orders.track({ token: "missing-token-1234567890" });
    expect(result).toBeUndefined();
  });

  it("requires a token or order number", async () => {
    const caller = appRouter.createCaller(publicContext());
    await expect(caller.orders.track({})).rejects.toThrow("يلزم رمز التتبع أو رقم الطلب");
  });

  it("validates required device information before creating an order", async () => {
    const caller = appRouter.createCaller(await ownerContext());
    await expect(
      caller.orders.create({
        serviceType: "maintenance",
        deviceInfo: "",
      }),
    ).rejects.toThrow();
  });

  it("rejects a price approval response when the secure token is not valid", async () => {
    const caller = appRouter.createCaller(publicContext());
    await expect(
      caller.orders.respondApproval({
        token: "missing-approval-token-1234567890",
        decision: "approved",
      }),
    ).rejects.toThrow("طلب الموافقة غير متاح");
  });
});

describe("Owner password hashing", () => {
  it("verifies the correct password and rejects a different password", async () => {
    const stored = await hashOwnerPassword("strong-password-123");
    await expect(
      verifyOwnerPassword("strong-password-123", stored.hash, stored.salt),
    ).resolves.toBe(true);
    await expect(
      verifyOwnerPassword("wrong-password", stored.hash, stored.salt),
    ).resolves.toBe(false);
  });
});
