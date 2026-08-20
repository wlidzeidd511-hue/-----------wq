import { eq } from "drizzle-orm";
import { branchSettings } from "../drizzle/schema";
import type { BranchSessionPayload } from "./branchAuth";
import { getDb } from "./db";

export async function currentBranchSession(branchId: number): Promise<BranchSessionPayload> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [branch] = await db
    .select({ sessionVersion: branchSettings.sessionVersion })
    .from(branchSettings)
    .where(eq(branchSettings.branchId, branchId))
    .limit(1);
  if (!branch) throw new Error(`Branch settings not found for ${branchId}`);
  return { kind: "owner_branch", branchId, sessionVersion: branch.sessionVersion };
}
