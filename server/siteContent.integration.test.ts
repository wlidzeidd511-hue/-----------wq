import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { contentEditLogs, siteContent } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { getShopSettings } from "./settingsDb";
import { currentBranchSession } from "./testBranchSession";

let contentId: number | null = null;

async function context(owner = false): Promise<TrpcContext> {
  const settings = await getShopSettings();
  return {
    user: null,
    ownerSession: owner ? { kind: "owner", sessionVersion: settings.sessionVersion } : null,
    branchSession: owner ? await currentBranchSession(1) : null,
    portalSession: null,
    req: { protocol: "https", headers: { "user-agent": "vitest-site-content" } } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db || !contentId) return;
  await db.delete(contentEditLogs).where(eq(contentEditLogs.contentId, contentId));
  await db.delete(siteContent).where(eq(siteContent.id, contentId));
  contentId = null;
});

describe("site content editor", () => {
  it("publishes an owner edit immediately and rejects public edits", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const contentKey = `vitest_content_${Date.now()}`;
    const inserted = await db.insert(siteContent).values({
      contentKey,
      contentType: "text",
      label: "نص اختبار مؤقت",
      value: "القيمة الأولى",
      defaultValue: "القيمة الأولى",
      isGlobal: true,
      category: "general",
      sortOrder: 999,
      isActive: true,
    });
    contentId = Number(inserted[0].insertId);

    const owner = appRouter.createCaller(await context(true));
    const visitor = appRouter.createCaller(await context(false));
    expect((await visitor.content.public())[contentKey]).toBe("القيمة الأولى");
    const saved = await owner.content.update({ id: contentId, value: "القيمة المحفوظة فورًا" });
    expect(saved.value).toBe("القيمة المحفوظة فورًا");
    expect((await visitor.content.public())[contentKey]).toBe("القيمة المحفوظة فورًا");
    await expect(visitor.content.update({ id: contentId, value: "تعديل ممنوع" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  }, 30_000);
});
