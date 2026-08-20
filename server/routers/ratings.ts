import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { customerProcedure, ownerBranchProcedure, publicProcedure, router } from "../_core/trpc";
import { writeAuditLog } from "../platformDb";
import {
  getCustomerRatingContext,
  getPublicRatingContext,
  listServiceRatings,
  markGoogleReviewShown,
  submitServiceRating,
} from "../ratingsDb";

const ratingInput = z.object({ stars: z.number().int().min(1).max(5), feedback: z.string().trim().max(2000).optional(), contactBranchId: z.number().int().positive().nullable().optional() });

async function recordRating(result: Awaited<ReturnType<typeof submitServiceRating>>) {
  if (!result) throw new TRPCError({ code: "BAD_REQUEST", message: "التقييم متاح بعد تسليم الجهاز فقط" });
  if (result.newlyCreated) {
    await writeAuditLog(
      { type: "customer", id: result.order.customerId, branchId: result.order.branchId },
      "service_rating.created",
      "service_rating",
      result.rating?.id,
      { orderId: result.order.id, stars: result.rating?.stars, contactBranchId: result.rating?.contactBranchId },
    );
  }
  return result;
}

export const ratingsRouter = router({
  owner: router({
    list: ownerBranchProcedure.input(z.object({ branchId: z.number().int().positive().optional() }).optional()).query(({ input, ctx }) => {
      if (input?.branchId && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن عرض تقييمات فرع آخر" });
      return listServiceRatings(ctx.ownerBranch.branchId);
    }),
  }),
  public: router({
    get: publicProcedure.input(z.object({ token: z.string().min(16).max(64) })).query(async ({ input }) => {
      const context = await getPublicRatingContext(input.token);
      if (!context) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      return context;
    }),
    submit: publicProcedure.input(ratingInput.extend({ token: z.string().min(16).max(64) })).mutation(async ({ input }) => {
      const context = await getPublicRatingContext(input.token);
      if (!context) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      return recordRating(await submitServiceRating({ orderId: context.order.id, stars: input.stars, feedback: input.feedback, contactBranchId: input.contactBranchId }));
    }),
    markGoogleShown: publicProcedure.input(z.object({ token: z.string().min(16).max(64) })).mutation(async ({ input }) => {
      const context = await getPublicRatingContext(input.token);
      if (!context) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      return markGoogleReviewShown(context.order.id);
    }),
  }),
  customer: router({
    get: customerProcedure.input(z.object({ orderId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      const context = await getCustomerRatingContext(ctx.customer.id, input.orderId);
      if (!context) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة في حسابك" });
      return context;
    }),
    submit: customerProcedure.input(ratingInput.extend({ orderId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const context = await getCustomerRatingContext(ctx.customer.id, input.orderId);
      if (!context) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة في حسابك" });
      return recordRating(await submitServiceRating({ orderId: context.order.id, stars: input.stars, feedback: input.feedback, contactBranchId: input.contactBranchId }));
    }),
    markGoogleShown: customerProcedure.input(z.object({ orderId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const context = await getCustomerRatingContext(ctx.customer.id, input.orderId);
      if (!context) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة في حسابك" });
      return markGoogleReviewShown(context.order.id);
    }),
  }),
});
