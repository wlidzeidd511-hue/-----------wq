import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { systemJobs } from "../drizzle/schema";
import { createDatabaseBackup } from "./backupDb";
import { purgeExpiredLoginAttempts } from "./authRateLimit";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";

export const DAILY_BACKUP_JOB_KEY = "daily_encrypted_backup";
export const DAILY_BACKUP_CRON = "0 0 0 * * *";

export async function ensureDailyBackupJobRow() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(systemJobs).values({ jobKey: DAILY_BACKUP_JOB_KEY, cronExpression: DAILY_BACKUP_CRON, isEnabled: true }).onDuplicateKeyUpdate({ set: { cronExpression: DAILY_BACKUP_CRON } });
}

export async function runDailyBackupJob(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensureDailyBackupJobRow();
  try {
    const snapshot = await createDatabaseBackup("scheduled", now);
    await purgeExpiredLoginAttempts();
    await db.update(systemJobs).set({ lastRunAt: Date.now(), lastStatus: "success", lastError: null }).where(eq(systemJobs.jobKey, DAILY_BACKUP_JOB_KEY));
    return { ok: true as const, snapshot };
  } catch (error) {
    await db.update(systemJobs).set({ lastRunAt: Date.now(), lastStatus: "failed", lastError: error instanceof Error ? error.message : String(error) }).where(eq(systemJobs.jobKey, DAILY_BACKUP_JOB_KEY));
    throw error;
  }
}

export async function dailyBackupHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [job] = await db.select().from(systemJobs).where(eq(systemJobs.scheduleCronTaskUid, user.taskUid)).limit(1);
    if (!job || job.jobKey !== DAILY_BACKUP_JOB_KEY) return res.json({ ok: true, skipped: "orphan" });
    return res.json(await runDailyBackupJob());
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
