import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getCustomerById, getStaffById } from "../accountDb";
import { claimOrderDeliveryPopup, claimOrderStatusPopup, getServiceOrderById, getServiceOrderByPublicToken, listCustomerOrders } from "../db";
import { acknowledgeDirectMessage, createDirectMessage, getDirectMessages, getPresenceRecipient, listOnlinePresence, listSentDirectMessages, recordPresence } from "../engagementDb";
import { ownerBranchProcedure, publicProcedure, router } from "../_core/trpc";
import { sendOrderWebPush } from "../webPush";

export const engagementRouter = router({
  heartbeat: publicProcedure
    .input(z.object({
      sessionKey: z.string().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/),
      currentPath: z.string().min(1).max(500),
      branchId: z.number().int().positive().nullable().optional(),
      orderToken: z.string().min(20).max(120).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      let displayLabel = "زائر";
      let customerId: number | null = null;
      let branchId = input.branchId ?? null;
      let orderId: number | null = null;
      if (input.orderToken) {
        const order = await getServiceOrderByPublicToken(input.orderToken);
        if (order) {
          orderId = order.id;
          branchId = order.branchId;
          customerId = order.customerId ?? null;
          displayLabel = order.customerName || (order.customerPhone ? `عميل ••••${order.customerPhone.slice(-4)}` : `فاتورة #${order.barcode}`);
        }
      }
      if (ctx.portalSession?.kind === "customer") {
        const customer = await getCustomerById(ctx.portalSession.accountId);
        customerId = customer?.id ?? null;
        displayLabel = customer?.name || (customer?.phoneNormalized ? `عميل ••••${customer.phoneNormalized.slice(-4)}` : "عميل مسجل");
      } else if (ctx.portalSession?.kind === "staff") {
        const staff = await getStaffById(ctx.portalSession.accountId);
        branchId = staff?.branchId ?? branchId;
        displayLabel = staff ? `موظف: ${staff.name}` : "موظف";
      }
      const userAgentHash = createHash("sha256").update(ctx.req.headers["user-agent"] ?? "unknown").digest("hex").slice(0, 64);
      return recordPresence({ sessionKey: input.sessionKey, currentPath: input.currentPath, branchId, customerId, orderId, displayLabel, userAgentHash });
    }),
  inbox: publicProcedure
    .input(z.object({ afterId: z.number().int().nonnegative().optional(), branchId: z.number().int().positive().nullable().optional(), sessionKey: z.string().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/).optional(), orderToken: z.string().min(20).max(120).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const trackedOrder = input?.orderToken ? await getServiceOrderByPublicToken(input.orderToken) : undefined;
      return getDirectMessages({
        afterId: input?.afterId,
        branchId: trackedOrder?.branchId ?? input?.branchId,
        customerId: ctx.portalSession?.kind === "customer" ? ctx.portalSession.accountId : trackedOrder?.customerId ?? null,
        orderId: trackedOrder?.id ?? null,
        sessionKey: input?.sessionKey,
      });
    }),
  acknowledgeMessage: publicProcedure
    .input(z.object({
      messageId: z.number().int().positive(),
      branchId: z.number().int().positive().nullable().optional(),
      sessionKey: z.string().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/).optional(),
      orderToken: z.string().min(20).max(120).regex(/^[A-Za-z0-9_-]+$/).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const trackedOrder = input.orderToken ? await getServiceOrderByPublicToken(input.orderToken) : undefined;
      return acknowledgeDirectMessage(input.messageId, {
        branchId: trackedOrder?.branchId ?? input.branchId,
        customerId: ctx.portalSession?.kind === "customer" ? ctx.portalSession.accountId : trackedOrder?.customerId ?? null,
        orderId: trackedOrder?.id ?? null,
        sessionKey: input.sessionKey,
      });
    }),
  claimDeliveryPopup: publicProcedure
    .input(z.object({ orderToken: z.string().min(20).max(120).regex(/^[A-Za-z0-9_-]+$/) }))
    .mutation(({ input }) => claimOrderDeliveryPopup(input.orderToken)),
  claimStatusPopup: publicProcedure
    .input(z.object({
      orderToken: z.string().min(20).max(120).regex(/^[A-Za-z0-9_-]+$/),
      status: z.string().min(1).max(40).regex(/^[a-z_]+$/),
    }))
    .mutation(({ input }) => claimOrderStatusPopup(input.orderToken, input.status)),
  online: ownerBranchProcedure
    .input(z.object({ branchId: z.number().int().positive().optional() }).optional())
    .query(({ input, ctx }) => {
      if (input?.branchId && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "الفرع غير مسموح في هذه الجلسة" });
      return listOnlinePresence(ctx.ownerBranch.branchId);
    }),
  sent: ownerBranchProcedure
    .input(z.object({ branchId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(({ input, ctx }) => {
      if (input?.branchId && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "الفرع غير مسموح في هذه الجلسة" });
      return listSentDirectMessages(ctx.ownerBranch.branchId, input?.limit);
    }),
  customerInvoices: ownerBranchProcedure
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const customer = await getCustomerById(input.customerId);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "حساب العميل غير موجود" });
      const orders = await listCustomerOrders(input.customerId);
      return orders.filter(order => order.branchId === ctx.ownerBranch.branchId).map(order => ({
        id: order.id,
        branchId: order.branchId,
        barcode: order.barcode,
        deviceInfo: order.deviceInfo,
        status: order.status,
        createdAt: order.createdAt,
      }));
    }),
  send: ownerBranchProcedure
    .input(z.object({
      branchId: z.number().int().positive().nullable().optional(),
      customerId: z.number().int().positive().nullable().optional(),
      targetSessionKey: z.string().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/).nullable().optional(),
      audience: z.enum(["customer", "visitor", "branch_online", "all_online"]),
      title: z.string().max(255).nullable().optional(),
      body: z.string().min(1).max(4000),
      expiresInMinutes: z.number().int().min(5).max(10080).default(1440),
    }).superRefine((value, ctx) => {
      if (value.audience === "customer" && !value.customerId) ctx.addIssue({ code: "custom", message: "اختر العميل" });
      if (value.audience === "visitor" && !value.targetSessionKey) ctx.addIssue({ code: "custom", message: "اختر الزائر" });
      if (value.audience === "branch_online" && !value.branchId) ctx.addIssue({ code: "custom", message: "اختر الفرع" });
    }))
    .mutation(async ({ input, ctx }) => {
      const branchId = ctx.ownerBranch.branchId;
      if (input.branchId && input.branchId !== branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن الإرسال من فرع آخر" });
      if (input.audience === "visitor" && input.targetSessionKey) {
        const recipient = await getPresenceRecipient(input.targetSessionKey);
        if (!recipient || recipient.lastSeenAt < Date.now() - 90_000) throw new TRPCError({ code: "NOT_FOUND", message: "الزبون لم يعد متصلًا؛ حدّث قائمة الزوار" });
        if (recipient.branchId !== branchId) throw new TRPCError({ code: "FORBIDDEN", message: "هذا الزائر لا يتبع الفرع المفتوح" });
        return createDirectMessage({
          ...input,
          branchId,
          customerId: recipient.customerId,
          orderId: recipient.orderId,
          createdById: null,
          expiresAt: Date.now() + input.expiresInMinutes * 60_000,
        });
      }
      if (input.audience === "customer" && input.customerId) {
        const customerOrders = await listCustomerOrders(input.customerId);
        if (!customerOrders.some(order => order.branchId === branchId)) throw new TRPCError({ code: "FORBIDDEN", message: "العميل لا يملك فاتورة في الفرع المفتوح" });
      }
      return createDirectMessage({
        ...input,
        branchId,
        audience: input.audience === "all_online" ? "branch_online" : input.audience,
        createdById: null,
        expiresAt: Date.now() + input.expiresInMinutes * 60_000,
      });
    }),
  sendToOrder: ownerBranchProcedure
    .input(z.object({
      orderId: z.number().int().positive(),
      title: z.string().trim().min(2).max(255),
      body: z.string().trim().min(1).max(4000),
      expiresInMinutes: z.number().int().min(5).max(10080).default(1440),
    }))
    .mutation(async ({ input, ctx }) => {
      const order = await getServiceOrderById(input.orderId);
      if (!order || order.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة في الفرع المفتوح" });
      if (!order.customerId) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يوجد حساب عميل مرتبط بهذه الفاتورة" });
      const message = await createDirectMessage({
        branchId: order.branchId,
        customerId: order.customerId,
        orderId: order.id,
        audience: "customer",
        title: input.title,
        body: input.body,
        createdById: null,
        expiresAt: Date.now() + input.expiresInMinutes * 60_000,
      });
      await sendOrderWebPush(
        order,
        "direct_message",
        input.title,
        input.body.length > 140 ? `${input.body.slice(0, 137)}...` : input.body,
      ).catch(() => undefined);
      return message;
    }),
});
