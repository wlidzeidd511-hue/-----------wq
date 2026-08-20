import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "./_core/env";

export type AuditIntegrityInput = {
  branchId: number | null;
  actorType: "owner" | "staff" | "customer" | "system";
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: string | null;
  createdAt: number;
};

function integritySecret() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for audit integrity");
  return ENV.cookieSecret;
}

function canonicalAuditValue(input: AuditIntegrityInput) {
  return JSON.stringify([
    input.branchId,
    input.actorType,
    input.actorId,
    input.action,
    input.entityType,
    input.entityId,
    input.metadata,
    input.createdAt,
  ]);
}

export function createAuditIntegrityHash(input: AuditIntegrityInput) {
  return createHmac("sha256", integritySecret()).update(canonicalAuditValue(input)).digest("hex");
}

export function verifyAuditIntegrity(input: AuditIntegrityInput, integrityHash: string | null | undefined) {
  if (!integrityHash || !/^[a-f0-9]{64}$/i.test(integrityHash)) return "legacy" as const;
  const expected = Buffer.from(createAuditIntegrityHash(input), "hex");
  const actual = Buffer.from(integrityHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? "verified" as const : "tampered" as const;
}
