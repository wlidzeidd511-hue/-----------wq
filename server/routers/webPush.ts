import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getServiceOrderByPublicToken, listCustomerOrders } from "../db";
import { customerProcedure, publicProcedure, router } from "../_core/trpc";
import { getWebPushPublicConfig } from "../webPush";
import { deactivateWebPushBindings, upsertWebPushBinding } from "../webPushDb";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  expirationTime: z.number().int().positive().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(255),
  }),
});

export const webPushRouter = router({
  config: publicProcedure.query(() => getWebPushPublicConfig()),
  track: router({
    subscribe: publicProcedure.input(z.object({ token: z.string().min(16).max(64), subscription: subscriptionSchema })).mutation(async ({ input }) => {
      const order = await getServiceOrderByPublicToken(input.token);
      if (!order || order.archived) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير متاحة" });
      await upsertWebPushBinding(input.subscription, {
        source: "order_tracking",
        branchId: order.branchId,
        customerId: order.customerId,
        orderId: order.id,
      });
      return { success: true as const };
    }),
    unsubscribe: publicProcedure.input(z.object({ token: z.string().min(16).max(64), endpoint: z.string().url().max(4096) })).mutation(async ({ input }) => {
      const order = await getServiceOrderByPublicToken(input.token);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير متاحة" });
      return deactivateWebPushBindings(input.endpoint, { orderId: order.id });
    }),
  }),
  customer: router({
    subscribe: customerProcedure.input(subscriptionSchema).mutation(async ({ input, ctx }) => {
      const orders = await listCustomerOrders(ctx.customer.id);
      const branchIds = Array.from(new Set(orders.map(order => order.branchId)));
      if (!branchIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "لا توجد فواتير مرتبطة بالحساب" });
      await Promise.all(branchIds.map(branchId => upsertWebPushBinding(input, {
        source: "customer_account",
        branchId,
        customerId: ctx.customer.id,
      })));
      return { success: true as const, branches: branchIds.length };
    }),
    unsubscribe: customerProcedure.input(z.object({ endpoint: z.string().url().max(4096) })).mutation(({ input, ctx }) => deactivateWebPushBindings(input.endpoint, { customerId: ctx.customer.id })),
  }),
});

