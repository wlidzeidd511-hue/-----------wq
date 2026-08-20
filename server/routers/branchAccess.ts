import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { BRANCH_SESSION_COOKIE, BRANCH_SESSION_TTL_MS, createBranchSessionToken } from "../branchAuth";
import { authenticateBranchProtection, changeBranchProtection, initializeBranchProtection, listBranchProtectionStates, validateBranchSession } from "../branchAccessDb";
import { assertLoginAllowed, recordLoginFailure, recordLoginSuccess } from "../authRateLimit";
import { getSessionCookieOptions } from "../_core/cookies";
import { ownerBranchProcedure, ownerProcedure, router } from "../_core/trpc";

const strongPassword = z.string().min(8, "كلمة الحماية يجب أن تكون 8 خانات على الأقل").max(128).refine(
  value => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value),
  "استخدم حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا خاصًا",
);

async function setBranchCookie(ctx: { req: Parameters<typeof getSessionCookieOptions>[0]; res: { cookie: Function } }, branchId: number, sessionVersion: number) {
  const token = await createBranchSessionToken(branchId, sessionVersion);
  ctx.res.cookie(BRANCH_SESSION_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: BRANCH_SESSION_TTL_MS });
}

export const branchAccessRouter = router({
  list: ownerProcedure.query(() => listBranchProtectionStates()),
  me: ownerProcedure.query(async ({ ctx }) => {
    if (!ctx.branchSession) return { authenticated: false as const, branch: null };
    const branch = await validateBranchSession(ctx.branchSession.branchId, ctx.branchSession.sessionVersion);
    if (!branch) return { authenticated: false as const, branch: null };
    return { authenticated: true as const, branch };
  }),
  initialize: ownerProcedure
    .input(z.object({ branchId: z.number().int().positive(), newPassword: strongPassword }))
    .mutation(async ({ input, ctx }) => {
      const initialized = await initializeBranchProtection(input.branchId, input.newPassword);
      if (initialized === null) throw new TRPCError({ code: "CONFLICT", message: "كلمة حماية هذا الفرع مهيأة مسبقًا" });
      if (!initialized) throw new TRPCError({ code: "NOT_FOUND", message: "الفرع غير موجود أو غير نشط" });
      await setBranchCookie(ctx, initialized.branchId, initialized.sessionVersion);
      return { authenticated: true as const, branch: initialized };
    }),
  unlock: ownerProcedure
    .input(z.object({ branchId: z.number().int().positive(), password: z.string().min(1).max(128) }))
    .mutation(async ({ input, ctx }) => {
      const identifier = `branch-access-${input.branchId}`;
      await assertLoginAllowed(ctx.req, "owner", identifier);
      const branch = await authenticateBranchProtection(input.branchId, input.password);
      if (!branch) {
        await recordLoginFailure(ctx.req, "owner", identifier);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة حماية الفرع غير صحيحة" });
      }
      await recordLoginSuccess(ctx.req, "owner", identifier);
      await setBranchCookie(ctx, branch.branchId, branch.sessionVersion);
      return { authenticated: true as const, branch };
    }),
  changePassword: ownerBranchProcedure
    .input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: strongPassword }))
    .mutation(async ({ input, ctx }) => {
      const result = await changeBranchProtection(ctx.ownerBranch.branchId, input.currentPassword, input.newPassword);
      if (result.status === "not_found") throw new TRPCError({ code: "NOT_FOUND", message: "الفرع غير موجود أو غير نشط" });
      if (result.status === "not_configured") throw new TRPCError({ code: "CONFLICT", message: "كلمة حماية الفرع غير مهيأة" });
      if (result.status === "invalid_password") throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة حماية الفرع الحالية غير صحيحة" });
      await setBranchCookie(ctx, result.branch.branchId, result.branch.sessionVersion);
      return { success: true as const, branch: result.branch };
    }),
  lock: ownerProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(BRANCH_SESSION_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
    return { success: true as const };
  }),
});
