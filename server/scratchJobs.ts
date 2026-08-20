import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { systemJobs } from "../drizzle/schema";
import { getDb } from "./db";
import { ensureMonthlyScratchCampaigns } from "./scratchDb";
import { sdk } from "./_core/sdk";

export const MONTHLY_SCRATCH_JOB_KEY = "monthly_scratch_codes";

export async function runMonthlyScratchJob() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    const branches = await ensureMonthlyScratchCampaigns();
    await db.update(systemJobs).set({ lastRunAt: Date.now(), lastStatus: "success", lastError: null }).where(eq(systemJobs.jobKey, MONTHLY_SCRATCH_JOB_KEY));
    return { ok: true as const, branches };
  } catch (error) {
    await db.update(systemJobs).set({ lastRunAt: Date.now(), lastStatus: "failed", lastError: error instanceof Error ? error.message : String(error) }).where(eq(systemJobs.jobKey, MONTHLY_SCRATCH_JOB_KEY));
    throw error;
  }
}

export async function monthlyScratchHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [job] = await db.select().from(systemJobs).where(eq(systemJobs.scheduleCronTaskUid, user.taskUid)).limit(1);
    if (!job || job.jobKey !== MONTHLY_SCRATCH_JOB_KEY) return res.json({ ok: true, skipped: "orphan" });
    const result = await runMonthlyScratchJob();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl, taskUid: (req as Request & { taskUid?: string }).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
