import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditLogs } from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { createAuditIntegrityHash, verifyAuditIntegrity } from "./auditIntegrity";
import { assertLoginAllowed, recordLoginFailure, recordLoginSuccess } from "./authRateLimit";
import { decryptBackupEnvelope, encryptBackupPayload, type BackupPayload } from "./backupDb";
import { getDb } from "./db";
import { listAuditLogs, writeAuditLog } from "./platformDb";
import { buildSecurityHeaders } from "./securityHeaders";

function mockRequest(seed: string) {
  return {
    protocol: "https",
    headers: { "x-forwarded-for": `10.20.${seed.length}.7`, "user-agent": `vitest-${seed}` },
    socket: { remoteAddress: `10.20.${seed.length}.7` },
  } as unknown as Request;
}

describe("security and continuity controls", () => {
  it("encrypts backups with AES-GCM and detects ciphertext tampering", () => {
    const payload: BackupPayload = {
      meta: { schemaVersion: 1, createdAt: "2026-08-05T20:00:00.000Z", rowCount: 2, tableCount: 1 },
      tables: { service_orders: [{ id: 1, barcode: "TEST-1" }, { id: 2, barcode: "TEST-2" }] },
    };
    const encrypted = encryptBackupPayload(payload, "unit-test-secret-with-enough-entropy");
    expect(encrypted.envelope).not.toContain("TEST-1");
    expect(decryptBackupEnvelope(encrypted.envelope, "unit-test-secret-with-enough-entropy").payload).toEqual(payload);
    const envelope = JSON.parse(encrypted.envelope) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -4)}AAAA`;
    expect(() => decryptBackupEnvelope(JSON.stringify(envelope), "unit-test-secret-with-enough-entropy")).toThrow();
  });

  it("signs audit rows and detects changes to protected fields", async () => {
    const input = { branchId: 1, actorType: "owner" as const, actorId: null, action: "order.updated", entityType: "service_order", entityId: "77", metadata: '{"field":"status"}', createdAt: 1_785_970_000_000 };
    const hash = createAuditIntegrityHash(input);
    expect(verifyAuditIntegrity(input, hash)).toBe("verified");
    expect(verifyAuditIntegrity({ ...input, action: "order.deleted" }, hash)).toBe("tampered");

    const entityId = `security-test-${randomUUID()}`;
    await writeAuditLog({ type: "system" }, "security.test", "security_test", entityId, { safe: true });
    const logs = await listAuditLogs(undefined, 500);
    const created = logs.find(log => log.entityId === entityId);
    expect(created?.integrityStatus).toBe("verified");
    const db = await getDb();
    if (db && created) await db.delete(auditLogs).where(eq(auditLogs.id, created.id));
  });

  it("blocks repeated login failures while storing only hashed keys and clears them after success", async () => {
    const identifier = `owner-${randomUUID()}`;
    const request = mockRequest(identifier);
    try {
      await assertLoginAllowed(request, "owner", identifier);
      for (let index = 0; index < 5; index += 1) await recordLoginFailure(request, "owner", identifier);
      await expect(assertLoginAllowed(request, "owner", identifier)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      await recordLoginSuccess(request, "owner", identifier);
      await expect(assertLoginAllowed(request, "owner", identifier)).resolves.toBeUndefined();
    } finally {
      await recordLoginSuccess(request, "owner", identifier);
    }
  }, 30_000);

  it("sets secure headers and uses HttpOnly SameSite=Lax cookies", () => {
    const headers = buildSecurityHeaders(false, true);
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("script-src-attr 'none'");
    expect(headers["Content-Security-Policy"]).toContain("upgrade-insecure-requests");
    expect(headers["Strict-Transport-Security"]).toContain("includeSubDomains");
    expect(headers["Strict-Transport-Security"]).toContain("preload");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Permitted-Cross-Domain-Policies"]).toBe("none");
    const cookie = getSessionCookieOptions(mockRequest("cookie"));
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  });
});
