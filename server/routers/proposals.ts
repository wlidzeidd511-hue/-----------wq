import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { customerProcedure, ownerBranchProcedure, publicProcedure, router } from "../_core/trpc";
import { getServiceOrderById } from "../db";
import { queueWhatsAppNotification } from "../notifications";
import { writeAuditLog } from "../platformDb";
import { sendOrderWebPush } from "../webPush";
import {
  createAdditionalRepairProposal,
  listAdditionalRepairProposals,
  listCustomerAdditionalRepairProposals,
  listPendingAdditionalProposalOrders,
  listPublicAdditionalRepairProposals,
  respondToAdditionalRepairProposal,
} from "../proposalsDb";

const decisionSchema = z.enum(["approved", "rejected"]);

async function requireBranchOrder(orderId: number, branchId: number) {
  const order = await getServiceOrderById(orderId);
  if (!order || order.branchId !== branchId) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة في الفرع المفتوح" });
}

async function recordDecision(result: Awaited<ReturnType<typeof respondToAdditionalRepairProposal>>, decision: "approved" | "rejected") {
  if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "عرض العطل غير موجود لهذا الطلب" });
  if (result.newlyResponded) {
    await writeAuditLog(
      { type: "customer", id: result.order.customerId, branchId: result.order.branchId },
      `repair_proposal.${decision}`,
      "additional_repair_proposal",
      result.proposal.id,
      { orderId: result.order.id, amount: result.proposal.amount },
    );
    if (result.order.customerPhone) {
      await queueWhatsAppNotification(
        result.order,
        `additional_repair_${decision}`,
        decision === "approved"
          ? `تم تسجيل موافقتك على ${result.proposal.issue} بتكلفة إضافية ${(result.proposal.amount / 100).toFixed(2)} ر.س.`
          : `تم تسجيل عدم موافقتك على ${result.proposal.issue}.`,
      );
    }
  }
  return result;
}

export const proposalsRouter = router({
  owner: router({
    pendingSummary: ownerBranchProcedure.query(({ ctx }) => listPendingAdditionalProposalOrders(ctx.ownerBranch.branchId)),
    list: ownerBranchProcedure.input(z.object({ orderId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      await requireBranchOrder(input.orderId, ctx.ownerBranch.branchId);
      return listAdditionalRepairProposals(input.orderId);
    }),
    create: ownerBranchProcedure.input(z.object({
      orderId: z.number().int().positive(),
      issue: z.string().trim().min(2).max(255),
      description: z.string().trim().max(2000).optional(),
      amount: z.number().int().positive().max(100_000_000),
    })).mutation(async ({ input, ctx }) => {
      await requireBranchOrder(input.orderId, ctx.ownerBranch.branchId);
      const result = await createAdditionalRepairProposal(input);
      if (!result) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن إضافة عرض لهذا الطلب بعد التسليم أو الإلغاء" });
      await writeAuditLog(
        { type: "owner", branchId: result.order.branchId },
        "repair_proposal.created",
        "additional_repair_proposal",
        result.proposal.id,
        { orderId: result.order.id, amount: result.proposal.amount, issue: result.proposal.issue },
      );
      if (result.order.customerPhone) {
        await queueWhatsAppNotification(
          result.order,
          "additional_repair_proposed",
          `اكتشفنا عطلًا إضافيًا في ${result.proposal.issue} بتكلفة ${(result.proposal.amount / 100).toFixed(2)} ر.س. يرجى فتح رابط التتبع للموافقة أو الرفض.`,
        );
      }
      await sendOrderWebPush(
        result.order,
        "additional_repair_proposed",
        "موافقتك مطلوبة على عطل إضافي",
        `تم اكتشاف ${result.proposal.issue} بتكلفة إضافية ${(result.proposal.amount / 100).toFixed(2)} ر.س. افتح التتبع للموافقة أو الرفض.`,
      ).catch(() => undefined);
      return result.proposal;
    }),
  }),
  public: router({
    list: publicProcedure.input(z.object({ token: z.string().min(16).max(64) })).query(async ({ input }) => {
      const proposals = await listPublicAdditionalRepairProposals(input.token);
      if (!proposals) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      return proposals;
    }),
    respond: publicProcedure.input(z.object({ token: z.string().min(16).max(64), proposalId: z.number().int().positive(), decision: decisionSchema })).mutation(async ({ input }) => {
      const result = await respondToAdditionalRepairProposal({ proposalId: input.proposalId, decision: input.decision, publicToken: input.token });
      return recordDecision(result, input.decision);
    }),
  }),
  customer: router({
    list: customerProcedure.input(z.object({ orderId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      const proposals = await listCustomerAdditionalRepairProposals(ctx.customer.id, input.orderId);
      if (!proposals) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة في حسابك" });
      return proposals;
    }),
    respond: customerProcedure.input(z.object({ proposalId: z.number().int().positive(), decision: decisionSchema })).mutation(async ({ input, ctx }) => {
      const result = await respondToAdditionalRepairProposal({ proposalId: input.proposalId, decision: input.decision, customerId: ctx.customer.id });
      return recordDecision(result, input.decision);
    }),
  }),
});
