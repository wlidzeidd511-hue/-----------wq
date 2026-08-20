import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { readPortalSession, type PortalSessionPayload } from "../accountAuth";
import { readOwnerSession, type OwnerSessionPayload } from "../adminAuth";
import { readBranchSession, type BranchSessionPayload } from "../branchAuth";
import { readSuperAdminSession, type SuperAdminSessionPayload } from "../superAdminAuth";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  ownerSession: OwnerSessionPayload | null;
  portalSession: PortalSessionPayload | null;
  branchSession?: BranchSessionPayload | null;
  superAdminSession: SuperAdminSessionPayload | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  const ownerSession = await readOwnerSession(opts.req);
  const portalSession = await readPortalSession(opts.req);
  const branchSession = await readBranchSession(opts.req);
  const superAdminSession = await readSuperAdminSession(opts.req);

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    ownerSession,
    portalSession,
    branchSession,
    superAdminSession,
  };
}
