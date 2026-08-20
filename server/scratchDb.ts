import { randomBytes, randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { branches, scratchCampaigns, scratchCodes, scratchPrizes, serviceOrders } from "../drizzle/schema";
import { getDb, getServiceOrderById } from "./db";
import { writeAuditLog } from "./platformDb";

export const SCRATCH_CODE_TTL_MS = 72 * 60 * 60 * 1000;

export function currentMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  return `${year}-${month}`;
}

function securePublicCode() {
  return randomBytes(24).toString("base64url");
}

function shuffle<T>(values: T[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export async function getScratchCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [campaign] = await db.select().from(scratchCampaigns).where(eq(scratchCampaigns.id, campaignId)).limit(1);
  if (!campaign) return undefined;
  const [prizes, codes] = await Promise.all([
    db.select().from(scratchPrizes).where(eq(scratchPrizes.campaignId, campaignId)).orderBy(asc(scratchPrizes.id)),
    db.select({ status: scratchCodes.status, prizeId: scratchCodes.prizeId }).from(scratchCodes).where(eq(scratchCodes.campaignId, campaignId)),
  ]);
  const stats = {
    total: codes.length,
    available: codes.filter(code => code.status === "available").length,
    assigned: codes.filter(code => code.status === "assigned").length,
    redeemed: codes.filter(code => code.status === "redeemed").length,
    expired: codes.filter(code => code.status === "expired").length,
    winningSlots: codes.filter(code => code.prizeId !== null && prizes.find(prize => prize.id === code.prizeId)?.isWinning).length,
  };
  return { campaign, prizes, stats };
}

export async function listScratchCampaigns(branchId?: number) {
  const db = await getDb();
  if (!db) return [];
  const campaigns = await db
    .select({ campaign: scratchCampaigns, branchName: branches.name })
    .from(scratchCampaigns)
    .leftJoin(branches, eq(scratchCampaigns.branchId, branches.id))
    .where(branchId ? eq(scratchCampaigns.branchId, branchId) : undefined)
    .orderBy(desc(scratchCampaigns.monthKey), asc(scratchCampaigns.branchId));
  return Promise.all(campaigns.map(async row => ({ ...row, stats: (await getScratchCampaign(row.campaign.id))?.stats })));
}

export async function ensureScratchCampaign(branchId: number, monthKey = currentMonthKey(), codeCount = 100) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = Date.now();
  await db.insert(scratchCampaigns).values({
    branchId,
    monthKey,
    codeCount,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onDuplicateKeyUpdate({ set: { updatedAt: now } });
  const [campaign] = await db
    .select()
    .from(scratchCampaigns)
    .where(and(eq(scratchCampaigns.branchId, branchId), eq(scratchCampaigns.monthKey, monthKey)))
    .limit(1);
  if (!campaign) throw new Error("تعذر إنشاء حملة الكشط");
  return campaign;
}

export async function updateScratchCampaign(id: number, input: { status?: "draft" | "active" | "closed"; codeCount?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(scratchCampaigns).set({ ...input, updatedAt: Date.now() }).where(eq(scratchCampaigns.id, id));
  await writeAuditLog({ type: "owner" }, "scratch.campaign.updated", "scratch_campaign", id, input);
  return getScratchCampaign(id);
}

export async function createScratchPrize(input: { campaignId: number; name: string; description?: string | null; quantity: number; isWinning: boolean; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const campaign = await getScratchCampaign(input.campaignId);
  if (!campaign) throw new Error("الحملة غير موجودة");
  const otherQuantity = campaign.prizes.filter(prize => prize.isActive).reduce((sum, prize) => sum + prize.quantity, 0);
  if (otherQuantity + input.quantity > campaign.campaign.codeCount) throw new Error("مجموع كميات الجوائز يتجاوز عدد الأكواد");
  const result = await db.insert(scratchPrizes).values({ ...input, isActive: input.isActive ?? true });
  const id = Number(result[0].insertId);
  await writeAuditLog({ type: "owner", branchId: campaign.campaign.branchId }, "scratch.prize.created", "scratch_prize", id, { name: input.name, quantity: input.quantity });
  return id;
}

export async function updateScratchPrize(id: number, input: Partial<{ name: string; description: string | null; quantity: number; isWinning: boolean; isActive: boolean }>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [prize] = await db.select().from(scratchPrizes).where(eq(scratchPrizes.id, id)).limit(1);
  if (!prize) throw new Error("الجائزة غير موجودة");
  const campaign = await getScratchCampaign(prize.campaignId);
  if (!campaign) throw new Error("الحملة غير موجودة");
  const nextQuantity = input.quantity ?? prize.quantity;
  const nextActive = input.isActive ?? prize.isActive;
  const otherQuantity = campaign.prizes.filter(item => item.id !== id && item.isActive).reduce((sum, item) => sum + item.quantity, 0);
  if ((nextActive ? nextQuantity : 0) + otherQuantity > campaign.campaign.codeCount) throw new Error("مجموع كميات الجوائز يتجاوز عدد الأكواد");
  await db.update(scratchPrizes).set(input).where(eq(scratchPrizes.id, id));
  await writeAuditLog({ type: "owner", branchId: campaign.campaign.branchId }, "scratch.prize.updated", "scratch_prize", id, input);
  return getScratchCampaign(prize.campaignId);
}

export async function getScratchPrizeBranchId(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [prize] = await db.select({ campaignId: scratchPrizes.campaignId }).from(scratchPrizes).where(eq(scratchPrizes.id, id)).limit(1);
  if (!prize) return undefined;
  return (await getScratchCampaign(prize.campaignId))?.campaign.branchId;
}

export async function deleteScratchPrize(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [prize] = await db.select().from(scratchPrizes).where(eq(scratchPrizes.id, id)).limit(1);
  if (!prize) return { success: true as const };
  const used = await db.select({ id: scratchCodes.id }).from(scratchCodes).where(and(eq(scratchCodes.prizeId, id), inArray(scratchCodes.status, ["assigned", "redeemed"]))).limit(1);
  if (used.length) throw new Error("لا يمكن حذف جائزة مرتبطة بكود مسند أو مستخدم");
  await db.update(scratchCodes).set({ prizeId: null }).where(eq(scratchCodes.prizeId, id));
  await db.delete(scratchPrizes).where(eq(scratchPrizes.id, id));
  await writeAuditLog({ type: "owner" }, "scratch.prize.deleted", "scratch_prize", id);
  return { success: true as const };
}

export async function generateScratchCodes(campaignId: number, redistribute = false) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const details = await getScratchCampaign(campaignId);
  if (!details) throw new Error("الحملة غير موجودة");
  if (details.stats.total >= details.campaign.codeCount && !redistribute) return details;
  if (redistribute && (details.stats.assigned > 0 || details.stats.redeemed > 0)) throw new Error("لا يمكن إعادة توزيع حملة بعد إسناد أكواد لعملاء");
  const activePrizes = details.prizes.filter(prize => prize.isActive);
  const winningPrizeIds = activePrizes.flatMap(prize => Array.from({ length: prize.quantity }, () => prize.id));
  if (winningPrizeIds.length > details.campaign.codeCount) throw new Error("مجموع الجوائز يتجاوز عدد الأكواد");
  const assignments = shuffle<number | null>([
    ...winningPrizeIds,
    ...Array.from({ length: details.campaign.codeCount - winningPrizeIds.length }, () => null),
  ]);
  const rows = Array.from({ length: details.campaign.codeCount }, (_, index) => ({
    campaignId,
    slotNumber: index + 1,
    branchId: details.campaign.branchId,
    prizeId: assignments[index],
    publicCode: securePublicCode(),
    status: "available" as const,
    createdAt: Date.now(),
  }));
  await db.insert(scratchCodes).values(rows).onDuplicateKeyUpdate({ set: { campaignId: sql`VALUES(campaignId)` } });
  const grouped = new Map<number | null, number[]>();
  assignments.forEach((prizeId, index) => grouped.set(prizeId, [...(grouped.get(prizeId) ?? []), index + 1]));
  for (const [prizeId, slots] of Array.from(grouped.entries())) {
    await db.update(scratchCodes)
      .set({ prizeId })
      .where(and(eq(scratchCodes.campaignId, campaignId), eq(scratchCodes.status, "available"), inArray(scratchCodes.slotNumber, slots)));
  }
  await writeAuditLog({ type: "owner", branchId: details.campaign.branchId }, "scratch.codes.generated", "scratch_campaign", campaignId, { codeCount: details.campaign.codeCount, winningSlots: winningPrizeIds.length });
  return getScratchCampaign(campaignId);
}

export async function configureAndGenerateScratchCampaign(input: {
  branchId: number;
  monthKey?: string;
  prizes: Array<{ name: string; description?: string | null; quantity: number }>;
}) {
  const prizes = input.prizes
    .map(prize => ({ ...prize, name: prize.name.trim(), description: prize.description?.trim() || null }))
    .filter(prize => prize.name && prize.quantity > 0);
  const winningSlots = prizes.reduce((sum, prize) => sum + prize.quantity, 0);
  if (!prizes.length) throw new Error("أضف جائزة واحدة على الأقل");
  if (winningSlots > 100) throw new Error("مجموع كميات الجوائز لا يمكن أن يتجاوز 100");

  const campaign = await ensureScratchCampaign(input.branchId, input.monthKey ?? currentMonthKey(), 100);
  const details = await getScratchCampaign(campaign.id);
  if (!details) throw new Error("تعذر فتح حملة الكشط");

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const lockedWinningCodes = await db.select({ id: scratchCodes.id })
    .from(scratchCodes)
    .where(and(eq(scratchCodes.campaignId, campaign.id), sql`${scratchCodes.status} <> 'available'`, sql`${scratchCodes.prizeId} IS NOT NULL`))
    .limit(1);
  if (lockedWinningCodes.length) throw new Error("لا يمكن تغيير جوائز حملة فيها نتيجة رابحة مسندة أو مكشوفة لعميل");
  await db.update(scratchCodes).set({ prizeId: null }).where(and(eq(scratchCodes.campaignId, campaign.id), eq(scratchCodes.status, "available")));
  await db.delete(scratchPrizes).where(eq(scratchPrizes.campaignId, campaign.id));
  await db.insert(scratchPrizes).values(prizes.map(prize => ({
    campaignId: campaign.id,
    name: prize.name,
    description: prize.description,
    quantity: prize.quantity,
    isWinning: true,
    isActive: true,
  })));
  await generateScratchCodes(campaign.id, false);
  const [activePrizes, availableCodes] = await Promise.all([
    db.select().from(scratchPrizes).where(and(eq(scratchPrizes.campaignId, campaign.id), eq(scratchPrizes.isActive, true))),
    db.select({ id: scratchCodes.id }).from(scratchCodes).where(and(eq(scratchCodes.campaignId, campaign.id), eq(scratchCodes.status, "available"))),
  ]);
  if (winningSlots > availableCodes.length) throw new Error(`المتاح الآن ${availableCodes.length} كود فقط لأن بعض الأكواد مسندة؛ خفّض كميات الجوائز`);
  const prizeAssignments = shuffle<number | null>([
    ...activePrizes.flatMap(prize => Array.from({ length: prize.quantity }, () => prize.id)),
    ...Array.from({ length: availableCodes.length - winningSlots }, () => null),
  ]);
  const groupedIds = new Map<number | null, number[]>();
  availableCodes.forEach((code, index) => groupedIds.set(prizeAssignments[index], [...(groupedIds.get(prizeAssignments[index]) ?? []), code.id]));
  for (const [prizeId, ids] of Array.from(groupedIds.entries())) {
    if (ids.length) await db.update(scratchCodes).set({ prizeId }).where(inArray(scratchCodes.id, ids));
  }
  await writeAuditLog({ type: "owner", branchId: input.branchId }, "scratch.campaign.configured", "scratch_campaign", campaign.id, {
    codeCount: 100,
    winningSlots,
    losingSlots: 100 - winningSlots,
    prizes: prizes.map(prize => ({ name: prize.name, quantity: prize.quantity })),
  });
  return getScratchCampaign(campaign.id);
}

export async function ensureMonthlyScratchCampaigns(monthKey = currentMonthKey()) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const activeBranches = await db.select({ id: branches.id, name: branches.name }).from(branches).where(eq(branches.isActive, true));
  const results = [];
  for (const branch of activeBranches) {
    const campaign = await ensureScratchCampaign(branch.id, monthKey, 100);
    let details = await getScratchCampaign(campaign.id);
    if (details && details.prizes.length === 0) {
      const [previous] = await db.select().from(scratchCampaigns)
        .where(and(eq(scratchCampaigns.branchId, branch.id), sql`${scratchCampaigns.id} <> ${campaign.id}`))
        .orderBy(desc(scratchCampaigns.monthKey))
        .limit(1);
      if (previous) {
        const previousPrizes = await db.select().from(scratchPrizes).where(and(eq(scratchPrizes.campaignId, previous.id), eq(scratchPrizes.isActive, true)));
        if (previousPrizes.length) await db.insert(scratchPrizes).values(previousPrizes.map(prize => ({ campaignId: campaign.id, name: prize.name, description: prize.description, quantity: prize.quantity, isWinning: prize.isWinning, isActive: true })));
        details = await getScratchCampaign(campaign.id);
      }
    }
    const generated = await generateScratchCodes(campaign.id);
    results.push({ branchId: branch.id, branchName: branch.name, campaignId: campaign.id, codeCount: generated?.stats.total ?? 0 });
  }
  await expireScratchCodes();
  return results;
}

export async function expireScratchCodes(now = Date.now()) {
  const db = await getDb();
  if (!db) return;
  await db.update(scratchCodes).set({ status: "expired" }).where(and(eq(scratchCodes.status, "assigned"), lte(scratchCodes.expiresAt, now)));
}

export async function assignScratchCodeToOrder(orderId: number, campaignId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(scratchCodes).where(eq(scratchCodes.orderId, orderId)).limit(1);
  if (existing[0]) return existing[0];
  const order = await getServiceOrderById(orderId);
  if (!order || !order.customerId) return undefined;
  const campaign = campaignId
    ? (await getScratchCampaign(campaignId))?.campaign
    : await ensureScratchCampaign(order.branchId);
  if (!campaign || campaign.branchId !== order.branchId) return undefined;
  if (campaign.status !== "active") return undefined;
  await generateScratchCodes(campaign.id);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [code] = await db.select().from(scratchCodes)
      .where(and(eq(scratchCodes.campaignId, campaign.id), eq(scratchCodes.status, "available")))
      .orderBy(sql`RAND()`)
      .limit(1);
    if (!code) return undefined;
    const now = Date.now();
    const result = await db.update(scratchCodes).set({
      customerId: order.customerId,
      orderId: order.id,
      status: "assigned",
      assignedAt: now,
      expiresAt: now + SCRATCH_CODE_TTL_MS,
    }).where(and(eq(scratchCodes.id, code.id), eq(scratchCodes.status, "available")));
    if ((result[0].affectedRows ?? 0) > 0) {
      const [assigned] = await db.select().from(scratchCodes).where(eq(scratchCodes.id, code.id)).limit(1);
      await writeAuditLog({ type: "system", branchId: order.branchId }, "scratch.code.assigned", "scratch_code", code.id, { orderId: order.id, customerId: order.customerId, expiresAt: now + SCRATCH_CODE_TTL_MS });
      return assigned;
    }
  }
  return undefined;
}

export async function listCustomerScratchCodes(customerId: number) {
  const db = await getDb();
  if (!db) return [];
  await expireScratchCodes();
  const rows = await db.select({
    id: scratchCodes.id,
    publicCode: scratchCodes.publicCode,
    status: scratchCodes.status,
    assignedAt: scratchCodes.assignedAt,
    expiresAt: scratchCodes.expiresAt,
    redeemedAt: scratchCodes.redeemedAt,
    orderId: scratchCodes.orderId,
    orderBarcode: serviceOrders.barcode,
    deviceInfo: serviceOrders.deviceInfo,
    branchName: branches.name,
    prizeName: scratchPrizes.name,
    prizeDescription: scratchPrizes.description,
    isWinning: scratchPrizes.isWinning,
  }).from(scratchCodes)
    .leftJoin(serviceOrders, eq(scratchCodes.orderId, serviceOrders.id))
    .leftJoin(branches, eq(scratchCodes.branchId, branches.id))
    .leftJoin(scratchPrizes, eq(scratchCodes.prizeId, scratchPrizes.id))
    .where(eq(scratchCodes.customerId, customerId))
    .orderBy(desc(scratchCodes.assignedAt));
  return rows.map(row => ({ ...row, prizeName: row.status === "redeemed" ? row.prizeName : null, prizeDescription: row.status === "redeemed" ? row.prizeDescription : null, isWinning: row.status === "redeemed" ? Boolean(row.isWinning) : null }));
}

export async function getCustomerScratchCode(customerId: number, publicCode: string) {
  const codes = await listCustomerScratchCodes(customerId);
  return codes.find(code => code.publicCode === publicCode);
}

export async function redeemCustomerScratchCode(customerId: number, publicCode: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await expireScratchCodes();
  const [current] = await db.select().from(scratchCodes).where(and(eq(scratchCodes.publicCode, publicCode), eq(scratchCodes.customerId, customerId))).limit(1);
  if (!current) return undefined;
  if (current.status === "expired") return { code: await getCustomerScratchCode(customerId, publicCode), newlyRedeemed: false };
  if (current.status === "redeemed") return { code: await getCustomerScratchCode(customerId, publicCode), newlyRedeemed: false };
  if (current.status !== "assigned" || !current.expiresAt || current.expiresAt <= Date.now()) return { code: await getCustomerScratchCode(customerId, publicCode), newlyRedeemed: false };
  const now = Date.now();
  const result = await db.update(scratchCodes).set({ status: "redeemed", redeemedAt: now }).where(and(eq(scratchCodes.id, current.id), eq(scratchCodes.status, "assigned")));
  const newlyRedeemed = (result[0].affectedRows ?? 0) > 0;
  if (newlyRedeemed) await writeAuditLog({ type: "customer", id: customerId, branchId: current.branchId }, "scratch.code.redeemed", "scratch_code", current.id, { orderId: current.orderId, prizeId: current.prizeId });
  return { code: await getCustomerScratchCode(customerId, publicCode), newlyRedeemed };
}
