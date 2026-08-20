import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  CUSTOMER_SESSION_TTL_MS,
  PORTAL_SESSION_COOKIE,
  STAFF_SESSION_TTL_MS,
  createPortalSessionToken,
} from "../accountAuth";
import {
  STAFF_PERMISSION_KEYS,
  STAFF_USERNAME_PATTERN,
  StaffUsernameTakenError,
  authenticateCustomer,
  authenticateStaff,
  changeCustomerPassword,
  createStaffAccount,
  deleteStaffAccount,
  findCustomerByPhone,
  getCustomerById,
  getStaffById,
  listStaffAccounts,
  resetStaffPassword,
  setStaffPassword,
  transferStaffAccount,
  updateStaffAccount,
  normalizeStaffUsername,
} from "../accountDb";
import { getSessionCookieOptions } from "../_core/cookies";
import { customerProcedure, ownerBranchProcedure, publicProcedure, router } from "../_core/trpc";
import { assertLoginAllowed, recordLoginFailure, recordLoginSuccess } from "../authRateLimit";
import { getCustomerAccountOrder, getServiceOrderById, listCustomerOrders, listCustomerOrdersForOwnerBranch } from "../db";
import { getCustomerLoyaltyProfile, getOrderCustomerLoyaltyProfile } from "../loyaltyDb";
import { getBranchById } from "../platformDb";

const permissionSchema = z.enum(STAFF_PERMISSION_KEYS);
const staffUsernameSchema = z.string()
  .transform(normalizeStaffUsername)
  .pipe(z.string()
    .min(2, "اسم الدخول لازم يكون حرفين على الأقل")
    .max(120, "اسم الدخول طويل جدًا")
    .regex(STAFF_USERNAME_PATTERN, "اسم الدخول يقبل حروفًا عربية أو إنجليزية وأرقامًا والنقطة والشرطة فقط دون مسافات"));
const staffPermanentPasswordSchema = z.string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
  .max(128, "كلمة المرور طويلة جدًا")
  .regex(/[a-z]/, "أضف حرفًا إنجليزيًا صغيرًا على الأقل")
  .regex(/[A-Z]/, "أضف حرفًا إنجليزيًا كبيرًا على الأقل")
  .regex(/[0-9]/, "أضف رقمًا واحدًا على الأقل")
  .regex(/[^A-Za-z0-9]/, "أضف رمزًا خاصًا واحدًا على الأقل");
const accountPhoneSchema = z.string().trim().min(8).max(30).regex(/^[+0-9 ()-]+$/, "صيغة رقم الجوال غير صحيحة");

async function requireStaffInBranch(staffId: number, branchId: number) {
  const staff = await getStaffById(staffId);
  if (!staff || staff.branchId !== branchId || staff.roleKey === "deleted") throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود في الفرع المفتوح" });
  return staff;
}

export const accountsRouter = router({
  staff: router({
    login: publicProcedure
      .input(z.object({ username: staffUsernameSchema, password: z.string().min(6).max(128) }).strict())
      .mutation(async ({ input, ctx }) => {
        await assertLoginAllowed(ctx.req, "staff", input.username);
        const staff = await authenticateStaff(input.username, input.password);
        if (!staff) {
          await recordLoginFailure(ctx.req, "staff", input.username);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "بيانات دخول الموظف غير صحيحة" });
        }
        await recordLoginSuccess(ctx.req, "staff", input.username);
        const token = await createPortalSessionToken({
          kind: "staff",
          accountId: staff.id,
          branchId: staff.branchId,
          sessionVersion: staff.sessionVersion,
        });
        ctx.res.cookie(PORTAL_SESSION_COOKIE, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: STAFF_SESSION_TTL_MS,
        });
        return { authenticated: true as const, staff };
      }),
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.portalSession || ctx.portalSession.kind !== "staff") return { authenticated: false as const, staff: null };
      const staff = await getStaffById(ctx.portalSession.accountId);
      if (
        !staff ||
        !staff.isActive ||
        staff.sessionVersion !== ctx.portalSession.sessionVersion ||
        staff.branchId !== ctx.portalSession.branchId
      ) return { authenticated: false as const, staff: null };
      return { authenticated: true as const, staff };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(PORTAL_SESSION_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true as const };
    }),
    list: ownerBranchProcedure
      .input(z.object({ branchId: z.number().int().positive().optional(), includeInactive: z.boolean().default(true) }).optional())
      .query(({ input, ctx }) => {
        if (input?.branchId && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن عرض موظفي فرع آخر" });
        return listStaffAccounts(ctx.ownerBranch.branchId, input?.includeInactive ?? true);
      }),
    create: ownerBranchProcedure
      .input(z.object({
        branchId: z.number().int().positive(),
        name: z.string().trim().min(2).max(255),
        username: staffUsernameSchema,
        phone: accountPhoneSchema.nullable().optional(),
        jobTitle: z.string().trim().max(160).nullable().optional(),
        roleKey: z.literal("employee").default("employee"),
        permissions: z.array(permissionSchema).min(1).optional(),
      }).strict())
      .mutation(async ({ input, ctx }) => {
        if (input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن إنشاء موظف في فرع آخر" });
        try {
          return await createStaffAccount(input);
        } catch (error) {
          if (error instanceof StaffUsernameTakenError) {
            throw new TRPCError({ code: "CONFLICT", message: error.message });
          }
          throw error;
        }
      }),
    update: ownerBranchProcedure
      .input(z.object({
        id: z.number().int().positive(),
        branchId: z.number().int().positive().optional(),
        name: z.string().trim().min(2).max(255).optional(),
        username: staffUsernameSchema.optional(),
        phone: accountPhoneSchema.nullable().optional(),
        jobTitle: z.string().trim().max(160).nullable().optional(),
        roleKey: z.literal("employee").optional(),
        permissions: z.array(permissionSchema).optional(),
        isActive: z.boolean().optional(),
      }).strict())
      .mutation(async ({ input, ctx }) => {
        await requireStaffInBranch(input.id, ctx.ownerBranch.branchId);
        if (input.branchId && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن نقل الموظف إلى فرع آخر من هذه الجلسة" });
        const { id, ...updates } = input;
        try {
          return await updateStaffAccount(id, updates);
        } catch (error) {
          if (error instanceof StaffUsernameTakenError) throw new TRPCError({ code: "CONFLICT", message: error.message });
          throw error;
        }
      }),
    transferBranch: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive(), targetBranchId: z.number().int().positive() }).strict())
      .mutation(async ({ input, ctx }) => {
        const staff = await requireStaffInBranch(input.id, ctx.ownerBranch.branchId);
        if (staff.branchId === input.targetBranchId) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف موجود في هذا الفرع بالفعل" });
        const targetBranch = await getBranchById(input.targetBranchId);
        if (!targetBranch || !targetBranch.isActive) throw new TRPCError({ code: "NOT_FOUND", message: "الفرع المستهدف غير متاح" });
        const transferred = await transferStaffAccount(input.id, input.targetBranchId);
        if (!transferred?.staff) throw new TRPCError({ code: "NOT_FOUND", message: "حساب الموظف غير موجود" });
        return { success: true as const, ...transferred, targetBranch: { id: targetBranch.id, name: targetBranch.name } };
      }),
    resetPassword: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive() }).strict())
      .mutation(async ({ input, ctx }) => {
        await requireStaffInBranch(input.id, ctx.ownerBranch.branchId);
        return resetStaffPassword(input.id);
      }),
    setPassword: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive(), newPassword: staffPermanentPasswordSchema }).strict())
      .mutation(async ({ input, ctx }) => {
        await requireStaffInBranch(input.id, ctx.ownerBranch.branchId);
        const result = await setStaffPassword(input.id, input.newPassword);
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "حساب الموظف غير موجود" });
        return { success: true as const, staff: result.staff };
      }),
    remove: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive() }).strict())
      .mutation(async ({ input, ctx }) => {
        await requireStaffInBranch(input.id, ctx.ownerBranch.branchId);
        const deleted = await deleteStaffAccount(input.id);
        if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "حساب الموظف غير موجود" });
        return { success: true as const, deleted };
      }),
  }),
  customer: router({
    ownerSearchByPhone: ownerBranchProcedure
      .input(z.object({ phone: accountPhoneSchema }).strict())
      .query(async ({ input, ctx }) => {
        const record = await findCustomerByPhone(input.phone);
        if (!record) return { customer: null, orders: [], undeliveredOrders: [], totals: { all: 0, undelivered: 0, activeWarranties: 0 } };
        const orders = await listCustomerOrdersForOwnerBranch(record.id, ctx.ownerBranch.branchId);
        if (!orders.length) return { customer: null, orders: [], undeliveredOrders: [], totals: { all: 0, undelivered: 0, activeWarranties: 0 } };
        const customer = await getCustomerById(record.id);
        if (!customer) return { customer: null, orders: [], undeliveredOrders: [], totals: { all: 0, undelivered: 0, activeWarranties: 0 } };
        const now = Date.now();
        const mappedOrders = orders.map(order => ({
          ...order,
          isUndelivered: order.status !== "delivered" && order.status !== "cancelled",
          warrantyState:
            order.status !== "delivered"
              ? "not_started" as const
              : order.warrantyExpiresAt && order.warrantyExpiresAt >= now
                ? "active" as const
                : order.warrantyExpiresAt
                  ? "expired" as const
                  : "unknown" as const,
        }));
        const undeliveredOrders = mappedOrders.filter(order => order.isUndelivered && !order.archived);
        return {
          customer: {
            id: customer.id,
            name: customer.name,
            phoneDisplay: customer.phoneDisplay,
            isActive: customer.isActive,
            createdAt: customer.createdAt,
            lastLoginAt: customer.lastLoginAt,
          },
          orders: mappedOrders,
          undeliveredOrders,
          totals: {
            all: mappedOrders.length,
            undelivered: undeliveredOrders.length,
            activeWarranties: mappedOrders.filter(order => order.warrantyState === "active").length,
          },
        };
      }),
    login: publicProcedure
      .input(z.object({ phone: accountPhoneSchema, password: z.string().min(6).max(128) }).strict())
      .mutation(async ({ input, ctx }) => {
        await assertLoginAllowed(ctx.req, "customer", input.phone);
        const customer = await authenticateCustomer(input.phone, input.password);
        if (!customer) {
          await recordLoginFailure(ctx.req, "customer", input.phone);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "رقم الجوال أو كلمة المرور غير صحيحة" });
        }
        await recordLoginSuccess(ctx.req, "customer", input.phone);
        const token = await createPortalSessionToken({
          kind: "customer",
          accountId: customer.id,
          sessionVersion: customer.sessionVersion,
        });
        ctx.res.cookie(PORTAL_SESSION_COOKIE, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: CUSTOMER_SESSION_TTL_MS,
        });
        return { authenticated: true as const, customer };
      }),
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.portalSession || ctx.portalSession.kind !== "customer") return { authenticated: false as const, customer: null };
      const customer = await getCustomerById(ctx.portalSession.accountId);
      if (!customer || !customer.isActive || customer.sessionVersion !== ctx.portalSession.sessionVersion) {
        return { authenticated: false as const, customer: null };
      }
      return { authenticated: true as const, customer, loyalty: await getCustomerLoyaltyProfile(customer.id) };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(PORTAL_SESSION_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true as const };
    }),
    changePassword: customerProcedure
      .input(z.object({ currentPassword: z.string().min(6).max(128), newPassword: staffPermanentPasswordSchema }).strict())
      .mutation(async ({ input, ctx }) => {
        const customer = await changeCustomerPassword(ctx.customer.id, input.currentPassword, input.newPassword);
        if (!customer) throw new TRPCError({ code: "BAD_REQUEST", message: "كلمة المرور الحالية غير صحيحة" });
        const token = await createPortalSessionToken({
          kind: "customer",
          accountId: customer.id,
          sessionVersion: customer.sessionVersion,
        });
        ctx.res.cookie(PORTAL_SESSION_COOKIE, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: CUSTOMER_SESSION_TTL_MS,
        });
        return { success: true as const };
      }),
    orders: customerProcedure.query(({ ctx }) => listCustomerOrders(ctx.customer.id)),
    order: customerProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const order = await getCustomerAccountOrder(ctx.customer.id, input.id);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة في حسابك" });
        return order;
      }),
  }),
  customerLoyalty: ownerBranchProcedure
    .input(z.object({ customerId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const orders = await listCustomerOrders(input.customerId);
      if (!orders.some(order => order.branchId === ctx.ownerBranch.branchId)) throw new TRPCError({ code: "NOT_FOUND", message: "العميل غير مرتبط بالفرع المفتوح" });
      return getCustomerLoyaltyProfile(input.customerId);
    }),
  orderLoyalty: ownerBranchProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const order = await getServiceOrderById(input.orderId);
      if (!order || order.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة في الفرع المفتوح" });
      return getOrderCustomerLoyaltyProfile(input.orderId);
    }),
});
