import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { getCustomerById, getStaffById, type StaffPermission } from "../accountDb";
import { getShopSettings } from "../settingsDb";
import { validateBranchSession } from "../branchAccessDb";
import { ensureOwnerSecuritySettings, listActiveOwnerPasskeys } from "../superAdminDb";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireOwner = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.ownerSession) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "OWNER_AUTH_REQUIRED" });
  }

  const settings = await getShopSettings();
  if (settings.sessionVersion !== ctx.ownerSession.sessionVersion) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "OWNER_SESSION_EXPIRED" });
  }

  return next({
    ctx: {
      ...ctx,
      ownerSession: ctx.ownerSession,
    },
  });
});

export const ownerProcedure = t.procedure.use(requireOwner);

const requireOwnerBranch = t.middleware(async ({ ctx, next }) => {
  if (!ctx.branchSession) {
    throw new TRPCError({ code: "FORBIDDEN", message: "BRANCH_ACCESS_REQUIRED" });
  }
  const ownerBranch = await validateBranchSession(ctx.branchSession.branchId, ctx.branchSession.sessionVersion);
  if (!ownerBranch) {
    throw new TRPCError({ code: "FORBIDDEN", message: "BRANCH_SESSION_EXPIRED" });
  }
  return next({ ctx: { ...ctx, branchSession: ctx.branchSession, ownerBranch } });
});

export const ownerBranchProcedure = ownerProcedure.use(requireOwnerBranch);

const requireSuperAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.superAdminSession) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "SUPER_ADMIN_AUTH_REQUIRED" });
  }
  const superAdminSession = ctx.superAdminSession;
  const security = await ensureOwnerSecuritySettings();
  if (security.sessionVersion !== superAdminSession.sessionVersion) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "SUPER_ADMIN_SESSION_EXPIRED" });
  }
  const passkeys = await listActiveOwnerPasskeys();
  const credentialStillActive = passkeys.some(passkey => passkey.credentialIdHash === superAdminSession.credentialIdHash);
  if (!credentialStillActive) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "SUPER_ADMIN_PASSKEY_REVOKED" });
  }
  return next({ ctx: { ...ctx, superAdminSession } });
});

export const superAdminProcedure = t.procedure.use(requireSuperAdmin);

const requireStaff = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.portalSession || ctx.portalSession.kind !== "staff") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "STAFF_AUTH_REQUIRED" });
  }
  const staff = await getStaffById(ctx.portalSession.accountId);
  if (
    !staff ||
    !staff.isActive ||
    staff.sessionVersion !== ctx.portalSession.sessionVersion ||
    staff.branchId !== ctx.portalSession.branchId
  ) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "STAFF_SESSION_EXPIRED" });
  }
  return next({ ctx: { ...ctx, staff } });
});

export const staffProcedure = t.procedure.use(requireStaff);

export function staffPermissionProcedure(permission: StaffPermission) {
  return t.procedure.use(
    t.middleware(async ({ ctx, next }) => {
      if (!ctx.portalSession || ctx.portalSession.kind !== "staff") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "STAFF_AUTH_REQUIRED" });
      }
      const staff = await getStaffById(ctx.portalSession.accountId);
      if (
        !staff ||
        !staff.isActive ||
        staff.sessionVersion !== ctx.portalSession.sessionVersion ||
        staff.branchId !== ctx.portalSession.branchId
      ) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "STAFF_SESSION_EXPIRED" });
      }
      if (!staff.permissionsList.includes(permission)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "STAFF_PERMISSION_REQUIRED" });
      }
      return next({ ctx: { ...ctx, staff } });
    }),
  );
}

const requireCustomer = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.portalSession || ctx.portalSession.kind !== "customer") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "CUSTOMER_AUTH_REQUIRED" });
  }
  const customer = await getCustomerById(ctx.portalSession.accountId);
  if (!customer || !customer.isActive || customer.sessionVersion !== ctx.portalSession.sessionVersion) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "CUSTOMER_SESSION_EXPIRED" });
  }
  return next({ ctx: { ...ctx, customer } });
});

export const customerProcedure = t.procedure.use(requireCustomer);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
