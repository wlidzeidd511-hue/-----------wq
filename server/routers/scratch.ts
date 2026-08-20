import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getBranchById } from "../platformDb";
import { getServiceOrderById } from "../db";
import { queueWhatsAppNotification } from "../notifications";
import {
  assignScratchCodeToOrder,
  configureAndGenerateScratchCampaign,
  createScratchPrize,
  currentMonthKey,
  deleteScratchPrize,
  ensureScratchCampaign,
  generateScratchCodes,
  getCustomerScratchCode,
  getScratchCampaign,
  getScratchPrizeBranchId,
  listCustomerScratchCodes,
  listScratchCampaigns,
  redeemCustomerScratchCode,
  updateScratchCampaign,
  updateScratchPrize,
} from "../scratchDb";
import { customerProcedure, ownerBranchProcedure, router } from "../_core/trpc";

async function requireCampaign(campaignId: number, branchId: number) {
  const campaign = await getScratchCampaign(campaignId);
  if (!campaign || campaign.campaign.branchId !== branchId) throw new TRPCError({ code: "NOT_FOUND", message: "حملة الكشط غير موجودة في الفرع المفتوح" });
  return campaign;
}

function assertBranch(requestedBranchId: number, branchId: number) {
  if (requestedBranchId !== branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن إدارة حملة فرع آخر" });
}

export const scratchRouter = router({
  admin: router({
    list: ownerBranchProcedure.input(z.object({ branchId: z.number().int().positive().optional() }).optional()).query(({ input, ctx }) => {
      if (input?.branchId) assertBranch(input.branchId, ctx.ownerBranch.branchId);
      return listScratchCampaigns(ctx.ownerBranch.branchId);
    }),
    details: ownerBranchProcedure.input(z.object({ campaignId: z.number().int().positive() })).query(({ input, ctx }) => requireCampaign(input.campaignId, ctx.ownerBranch.branchId)),
    ensure: ownerBranchProcedure.input(z.object({ branchId: z.number().int().positive(), monthKey: z.string().regex(/^\d{4}-\d{2}$/).default(currentMonthKey()), codeCount: z.number().int().min(1).max(500).default(100) })).mutation(({ input, ctx }) => {
      assertBranch(input.branchId, ctx.ownerBranch.branchId);
      return ensureScratchCampaign(input.branchId, input.monthKey, input.codeCount);
    }),
    configureAndGenerate: ownerBranchProcedure.input(z.object({
      branchId: z.number().int().positive(),
      monthKey: z.string().regex(/^\d{4}-\d{2}$/).default(currentMonthKey()),
      prizes: z.array(z.object({
        name: z.string().trim().min(1).max(255),
        description: z.string().max(2000).nullable().optional(),
        quantity: z.number().int().min(1).max(100),
      })).min(1).max(25),
    }).superRefine((value, ctx) => {
      if (value.prizes.reduce((sum, prize) => sum + prize.quantity, 0) > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["prizes"], message: "مجموع كميات الجوائز لا يمكن أن يتجاوز 100" });
    })).mutation(({ input, ctx }) => {
      assertBranch(input.branchId, ctx.ownerBranch.branchId);
      return configureAndGenerateScratchCampaign(input);
    }),
    updateCampaign: ownerBranchProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["draft", "active", "closed"]).optional(), codeCount: z.number().int().min(1).max(500).optional() })).mutation(async ({ input, ctx }) => {
      await requireCampaign(input.id, ctx.ownerBranch.branchId);
      const { id, ...updates } = input;
      return updateScratchCampaign(id, updates);
    }),
    addPrize: ownerBranchProcedure.input(z.object({ campaignId: z.number().int().positive(), name: z.string().min(1).max(255), description: z.string().max(2000).nullable().optional(), quantity: z.number().int().min(0).max(500), isWinning: z.boolean().default(true), isActive: z.boolean().default(true) })).mutation(async ({ input, ctx }) => {
      await requireCampaign(input.campaignId, ctx.ownerBranch.branchId);
      return createScratchPrize(input);
    }),
    updatePrize: ownerBranchProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(255).optional(), description: z.string().max(2000).nullable().optional(), quantity: z.number().int().min(0).max(500).optional(), isWinning: z.boolean().optional(), isActive: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
      if (await getScratchPrizeBranchId(input.id) !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "الجائزة غير موجودة في الفرع المفتوح" });
      const { id, ...updates } = input;
      return updateScratchPrize(id, updates);
    }),
    deletePrize: ownerBranchProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      if (await getScratchPrizeBranchId(input.id) !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "الجائزة غير موجودة في الفرع المفتوح" });
      return deleteScratchPrize(input.id);
    }),
    generate: ownerBranchProcedure.input(z.object({ campaignId: z.number().int().positive(), redistribute: z.boolean().default(false) })).mutation(async ({ input, ctx }) => {
      await requireCampaign(input.campaignId, ctx.ownerBranch.branchId);
      return generateScratchCodes(input.campaignId, input.redistribute);
    }),
    assignOrder: ownerBranchProcedure.input(z.object({ orderId: z.number().int().positive(), campaignId: z.number().int().positive().optional() })).mutation(async ({ input, ctx }) => {
      const order = await getServiceOrderById(input.orderId);
      if (!order || order.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة في الفرع المفتوح" });
      if (input.campaignId) await requireCampaign(input.campaignId, ctx.ownerBranch.branchId);
      return assignScratchCodeToOrder(input.orderId, input.campaignId);
    }),
    runMonthly: ownerBranchProcedure.mutation(async ({ ctx }) => {
      const campaign = await ensureScratchCampaign(ctx.ownerBranch.branchId, currentMonthKey(), 100);
      return generateScratchCodes(campaign.id, false);
    }),
  }),
  customer: router({
    list: customerProcedure.query(({ ctx }) => listCustomerScratchCodes(ctx.customer.id)),
    get: customerProcedure.input(z.object({ code: z.string().min(20).max(80) })).query(async ({ input, ctx }) => {
      const code = await getCustomerScratchCode(ctx.customer.id, input.code);
      if (!code) throw new TRPCError({ code: "NOT_FOUND", message: "كود الكشط غير موجود في حسابك" });
      return code;
    }),
    redeem: customerProcedure.input(z.object({ code: z.string().min(20).max(80) })).mutation(async ({ input, ctx }) => {
      const result = await redeemCustomerScratchCode(ctx.customer.id, input.code);
      if (!result?.code) throw new TRPCError({ code: "NOT_FOUND", message: "كود الكشط غير موجود في حسابك" });
      if (result.newlyRedeemed && result.code.isWinning && result.code.orderId) {
        const order = await getServiceOrderById(result.code.orderId);
        if (order?.customerPhone) {
          const branch = await getBranchById(order.branchId);
          await queueWhatsAppNotification(order, "scratch_win", `مبروك! ربحت ${result.code.prizeName ?? "جائزة"} في اكشط واربح.`, {
            order_number: order.barcode,
            branch_name: branch?.name ?? "هاتف التميز",
            prize_name: result.code.prizeName ?? "جائزة",
          });
        }
      }
      return result.code;
    }),
  }),
});
