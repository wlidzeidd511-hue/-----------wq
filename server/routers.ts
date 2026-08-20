import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createOrGetCustomer } from "./accountDb";
import {
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_TTL_MS,
  createOwnerSessionToken,
} from "./adminAuth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { ownerBranchProcedure, ownerProcedure, publicProcedure, router } from "./_core/trpc";
import {
  addOrderPhoto,
  createServiceOrder,
  deleteOrderPhoto,
  getCustomerOrderBundle,
  getDashboardReport,
  getOrderNotifications,
  getOwnerOrderBundle,
  getServiceOrderById,
  listServiceOrders,
  normalizeServiceOrderBarcodes,
  respondToPriceApproval,
  setOrderArchived,
  setOrdersArchived,
  updateServiceOrderDetails,
  updateOrderPhotoVisibility,
  updateServiceOrderStatus,
} from "./db";
import { buildManualWhatsAppUrl, queueWhatsAppNotification } from "./notifications";
import { getInvoiceTotals } from "./orderWorkflow";
import { getBranchById, writeAuditLog } from "./platformDb";
import { accountsRouter } from "./routers/accounts";
import { platformRouter } from "./routers/platform";
import { staffRouter } from "./routers/staff";
import { engagementRouter } from "./routers/engagement";
import { proposalsRouter } from "./routers/proposals";
import { ratingsRouter } from "./routers/ratings";
import { scratchRouter } from "./routers/scratch";
import { internalAlertsRouter } from "./routers/internalAlerts";
import { webPushRouter } from "./routers/webPush";
import { branchAccessRouter } from "./routers/branchAccess";
import { ownerMetricsRouter } from "./routers/ownerMetrics";
import { superAdminRouter } from "./routers/superAdmin";
import { assignScratchCodeToOrder } from "./scratchDb";
import { assertLoginAllowed, recordLoginFailure, recordLoginSuccess } from "./authRateLimit";
import { storagePut } from "./storage";
import { PUBLIC_SITE_URL } from "../shared/siteConfig";
import { sendOrderWebPush } from "./webPush";
import { transitionOrderStatus } from "./orderStatusWorkflow";
import {
  authenticateOwner,
  changeOwnerPassword,
  getShopSettings,
  toPublicShopSettings,
  updateShopSettings,
} from "./settingsDb";

const statusSchema = z.enum([
  "pending",
  "diagnosing",
  "awaiting_approval",
  "in_progress",
  "ready",
  "delivered",
  "cancelled",
]);

const optionalText = (max: number) => z.string().trim().max(max).optional();
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const phoneSchema = z.string().trim().min(8).max(30).regex(/^[+0-9 ()-]+$/, "صيغة رقم الجوال غير صحيحة");
const strongPasswordSchema = z.string().min(8).max(128)
  .regex(/[a-z]/, "أضف حرفًا إنجليزيًا صغيرًا على الأقل")
  .regex(/[A-Z]/, "أضف حرفًا إنجليزيًا كبيرًا على الأقل")
  .regex(/[0-9]/, "أضف رقمًا واحدًا على الأقل")
  .regex(/[^A-Za-z0-9]/, "أضف رمزًا خاصًا واحدًا على الأقل");

function hasExpectedImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function assertRequestedOwnerBranch(requestedBranchId: number | undefined, ownerBranchId: number) {
  if (requestedBranchId !== undefined && requestedBranchId !== ownerBranchId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن الوصول إلى بيانات فرع آخر من هذه الجلسة" });
  }
  return ownerBranchId;
}

async function requireOwnerBranchOrder(orderId: number, ownerBranchId: number) {
  const order = await getServiceOrderById(orderId);
  if (!order || order.branchId !== ownerBranchId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود في الفرع المفتوح" });
  }
  return order;
}

export const appRouter = router({
  system: systemRouter,
  accounts: accountsRouter,
  platform: platformRouter,
  engagement: engagementRouter,
  proposals: proposalsRouter,
  ratings: ratingsRouter,
  scratch: scratchRouter,
  internalAlerts: internalAlertsRouter,
  webPush: webPushRouter,
  branchAccess: branchAccessRouter,
  ownerMetrics: ownerMetricsRouter,
  superAdmin: superAdminRouter,
  staff: staffRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true as const };
    }),
  }),

  owner: router({
    login: publicProcedure
      .input(z.object({ password: z.string().min(5).max(128) }))
      .mutation(async ({ input, ctx }) => {
        await assertLoginAllowed(ctx.req, "owner", "owner-login");
        const settings = await authenticateOwner(input.password);
        if (!settings) {
          await recordLoginFailure(ctx.req, "owner", "owner-login");
          throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة المرور غير صحيحة" });
        }
        await recordLoginSuccess(ctx.req, "owner", "owner-login");

        const token = await createOwnerSessionToken(settings.sessionVersion);
        ctx.res.cookie(OWNER_SESSION_COOKIE, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: OWNER_SESSION_TTL_MS,
        });
        return {
          authenticated: true as const,
          settings: toPublicShopSettings(settings),
          mustChangeDefaultPassword: input.password === "12345",
        };
      }),
    me: publicProcedure.query(async ({ ctx }) => {
      const settings = await getShopSettings();
      if (!ctx.ownerSession || ctx.ownerSession.sessionVersion !== settings.sessionVersion) {
        return { authenticated: false as const, settings: null };
      }
      return { authenticated: true as const, settings: toPublicShopSettings(settings) };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(OWNER_SESSION_COOKIE, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true as const };
    }),
    changePassword: ownerBranchProcedure
      .input(
        z.object({
          currentPassword: z.string().min(5).max(128),
          newPassword: strongPasswordSchema,
        }).strict(),
      )
      .mutation(async ({ input, ctx }) => {
        const settings = await changeOwnerPassword(input.currentPassword, input.newPassword);
        if (!settings) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "كلمة المرور الحالية غير صحيحة" });
        }
        const token = await createOwnerSessionToken(settings.sessionVersion);
        ctx.res.cookie(OWNER_SESSION_COOKIE, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: OWNER_SESSION_TTL_MS,
        });
        return { success: true as const };
      }),
  }),

  settings: router({
    public: publicProcedure.query(async () => toPublicShopSettings(await getShopSettings())),
    update: ownerBranchProcedure
      .input(
        z.object({
          shopName: z.string().trim().min(2).max(255).optional(),
          subtitle: z.string().trim().max(255).optional(),
          phone: phoneSchema.nullable().optional(),
          whatsappPhone: phoneSchema.nullable().optional(),
          address: nullableText(2000),
          mapUrl: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
          openingHours: nullableText(2000),
          warrantyPolicy: nullableText(4000),
          currency: z.string().trim().min(1).max(10).optional(),
          loyaltyRegularOrderThreshold: z.number().int().min(1).max(100).optional(),
          loyaltyDistinguishedSpendThreshold: z.number().int().min(0).max(100_000_000).optional(),
          loyaltyVipSpendThreshold: z.number().int().min(0).max(100_000_000).optional(),
        }).strict(),
      )
      .mutation(async ({ input }) => {
        const normalized = { ...input, mapUrl: input.mapUrl === "" ? null : input.mapUrl };
        return toPublicShopSettings(await updateShopSettings(normalized));
      }),
  }),

  orders: router({
    create: ownerBranchProcedure
      .input(
        z.object({
          branchId: z.number().int().positive().default(1),
          serviceType: z.enum(["maintenance", "programming"]),
          deviceInfo: z.string().trim().min(1).max(2000),
          reportedIssue: optionalText(255),
          deviceBrand: optionalText(100),
          deviceModel: optionalText(100),
          serialNumber: optionalText(160),
          receivedAccessories: optionalText(2000),
          intakeCondition: optionalText(2000),
          customerName: optionalText(255),
          customerPhone: phoneSchema.optional(),
          customerVisibleNotes: optionalText(4000),
          internalNotes: optionalText(4000),
          deviceLocation: optionalText(500),
          notes: optionalText(4000),
          price: z.number().int().nonnegative().default(0),
          cost: z.number().int().nonnegative().default(0),
          amountPaid: z.number().int().nonnegative().default(0),
          estimatedTime: z.number().int().nonnegative().default(0),
          estimatedCompletionAt: z.number().int().positive().optional(),
          warrantyDays: z.number().int().min(0).max(3650).default(30),
          requestPriceApproval: z.boolean().default(false),
        }).strict(),
      )
      .mutation(async ({ input, ctx }) => {
        assertRequestedOwnerBranch(input.branchId, ctx.ownerBranch.branchId);
        if (input.requestPriceApproval && (!input.customerPhone?.trim() || input.price <= 0)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "يلزم رقم جوال وسعر أكبر من صفر لإرسال الموافقة" });
        }
        const customerAccount = input.customerPhone
          ? await createOrGetCustomer({
              phone: input.customerPhone,
              name: input.customerName,
              whatsappOptIn: true,
            })
          : null;
        const order = await createServiceOrder({
          ...input,
          customerId: customerAccount?.customer.id,
          customerVisibleNotes: input.customerVisibleNotes ?? input.notes,
        });
        if (order.customerPhone) {
          const branch = await getBranchById(order.branchId);
          const branchName = branch?.name ?? "هاتف التميز";
          if (customerAccount?.created && customerAccount.temporaryPassword) {
            await queueWhatsAppNotification(
              order,
              "account_created",
              `تم إنشاء حسابك في هاتف التميز. رقم الجوال: ${order.customerPhone}، كلمة المرور المؤقتة: ${customerAccount.temporaryPassword}`,
              {
                branch_name: branchName,
                credentials: `${order.customerPhone} / ${customerAccount.temporaryPassword}`,
              },
            );
          }
          await queueWhatsAppNotification(
            order,
            "invoice_created",
            `تم إنشاء فاتورة رقم ${order.barcode}. يمكنك متابعة الجهاز من رابط الفاتورة.`,
            {
              order_number: order.barcode,
              branch_name: branchName,
              tracking_url: `${PUBLIC_SITE_URL}/track?t=${order.publicToken}`,
            },
          );
          if (input.requestPriceApproval) {
            await queueWhatsAppNotification(
              order,
              "price_approval_requested",
              `نرجو مراجعة السعر والموافقة عليه لطلب رقم ${order.barcode}`,
              {
                order_number: order.barcode,
                branch_name: branchName,
                tracking_url: `${PUBLIC_SITE_URL}/track?t=${order.publicToken}`,
              },
            );
          }
        }
        return {
          order,
          barcode: order.barcode,
          publicToken: order.publicToken,
          customerAccountCreated: customerAccount?.created ?? false,
          temporaryPassword: customerAccount?.temporaryPassword ?? null,
        };
      }),

    track: publicProcedure
      .input(
        z
          .object({
            token: z.string().min(16).max(64).optional(),
            barcode: z.string().max(64).optional(),
            phoneLast4: z.string().max(4).optional(),
            branchId: z.number().int().positive().optional(),
          })
          .refine(value => value.token || value.barcode, "يلزم رمز التتبع أو رقم الطلب"),
      )
      .query(({ input }) => getCustomerOrderBundle(input)),

    getByBarcode: publicProcedure
      .input(z.object({
        barcode: z.string().max(64),
        phoneLast4: z.string().max(4).optional(),
        branchId: z.number().int().positive().optional(),
      }))
      .query(({ input }) => getCustomerOrderBundle(input)),

    respondApproval: publicProcedure
      .input(
        z.object({
          token: z.string().min(16).max(64),
          decision: z.enum(["approved", "rejected"]),
        }),
      )
      .mutation(async ({ input }) => {
        const result = await respondToPriceApproval(input.token, input.decision);
        if (!result) {
          throw new TRPCError({ code: "NOT_FOUND", message: "طلب الموافقة غير متاح" });
        }
        return result;
      }),

    getById: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        await requireOwnerBranchOrder(input.id, ctx.ownerBranch.branchId);
        return getOwnerOrderBundle(input.id);
      }),

    getAll: ownerBranchProcedure
      .input(
        z
          .object({
            search: z.string().max(255).optional(),
            branchId: z.number().int().positive().optional(),
            status: z.union([statusSchema, z.literal("all")]).optional(),
            serviceType: z.enum(["maintenance", "programming", "all"]).optional(),
            archived: z.boolean().optional(),
            from: z.number().int().optional(),
            to: z.number().int().optional(),
          })
          .optional(),
      )
      .query(({ input, ctx }) => {
        const branchId = assertRequestedOwnerBranch(input?.branchId, ctx.ownerBranch.branchId);
        return listServiceOrders({ ...(input ?? {}), branchId });
      }),

    report: ownerBranchProcedure
      .input(z.object({ branchId: z.number().int().positive().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const branchId = assertRequestedOwnerBranch(input?.branchId, ctx.ownerBranch.branchId);
        const report = await getDashboardReport(branchId);
        return {
          total: report.total,
          active: report.active,
          ready: report.ready,
          awaitingApproval: report.awaitingApproval,
          today: report.today,
          month: report.month,
          mostCommonFault: report.mostCommonFault,
          averageCompletionMs: report.averageCompletionMs,
          averageWaitBeforeWorkMs: report.averageWaitBeforeWorkMs,
          completionSampleSize: report.completionSampleSize,
          waitSampleSize: report.waitSampleSize,
        };
      }),

    financialReport: ownerBranchProcedure
      .input(z.object({
        password: z.string().min(5).max(128),
        branchId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await assertLoginAllowed(ctx.req, "owner", "financial-report");
        const authenticated = await authenticateOwner(input.password);
        if (!authenticated) {
          await recordLoginFailure(ctx.req, "owner", "financial-report");
          throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة المرور غير صحيحة" });
        }
        await recordLoginSuccess(ctx.req, "owner", "financial-report");
        const branchId = assertRequestedOwnerBranch(input.branchId, ctx.ownerBranch.branchId);
        return getDashboardReport(branchId);
      }),

    normalizeNumbers: ownerBranchProcedure.mutation(() => {
      throw new TRPCError({ code: "FORBIDDEN", message: "إعادة الترقيم الشاملة معطلة لحماية عزل الفروع" });
    }),

    updateStatus: ownerBranchProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: statusSchema,
          note: optionalText(2000),
          visibleToCustomer: z.boolean().default(true),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        return transitionOrderStatus({
          orderId: input.id,
          branchId: ctx.ownerBranch.branchId,
          status: input.status,
          note: input.note,
          visibleToCustomer: input.visibleToCustomer,
          actor: { type: "owner", branchId: ctx.ownerBranch.branchId },
        });
      }),

    updateDetails: ownerBranchProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          deviceInfo: optionalText(2000),
          reportedIssue: nullableText(255),
          deviceBrand: nullableText(100),
          deviceModel: nullableText(100),
          serialNumber: nullableText(160),
          receivedAccessories: nullableText(2000),
          intakeCondition: nullableText(2000),
          customerName: nullableText(255),
          customerPhone: phoneSchema.nullable().optional(),
          customerVisibleNotes: nullableText(4000),
          internalNotes: nullableText(4000),
          deviceLocation: nullableText(500),
          price: z.number().int().nonnegative().optional(),
          cost: z.number().int().nonnegative().optional(),
          amountPaid: z.number().int().nonnegative().optional(),
          estimatedTime: z.number().int().nonnegative().optional(),
          estimatedCompletionAt: z.number().int().positive().nullable().optional(),
          warrantyDays: z.number().int().min(0).max(3650).optional(),
          requestPriceApproval: z.boolean().optional(),
          expectedUpdatedAt: z.number().int().nonnegative().optional(),
        }).strict(),
      )
      .mutation(async ({ input, ctx }) => {
        const currentOrder = await requireOwnerBranchOrder(input.id, ctx.ownerBranch.branchId);
        const { id, expectedUpdatedAt, ...updates } = input;
        if (expectedUpdatedAt !== undefined && new Date(currentOrder.updatedAt).getTime() !== expectedUpdatedAt) {
          throw new TRPCError({ code: "CONFLICT", message: "تم تعديل الفاتورة من مستخدم آخر. بياناتك لم تُحذف؛ حدّث التفاصيل وراجع التغييرات قبل الحفظ." });
        }
        const customerAccount = updates.customerPhone
          ? await createOrGetCustomer({
              phone: updates.customerPhone,
              name: updates.customerName,
              whatsappOptIn: true,
            })
          : null;
        const order = await updateServiceOrderDetails(id, {
          ...updates,
          ...(updates.customerPhone === null
            ? { customerId: null }
            : customerAccount
              ? { customerId: customerAccount.customer.id }
              : {}),
        });
        if (updates.requestPriceApproval && order?.customerPhone) {
          await queueWhatsAppNotification(
            order,
            "price_approval_requested",
            `نرجو مراجعة السعر والموافقة عليه لطلب رقم ${order.barcode}`,
          );
        }
        if (updates.requestPriceApproval && order) {
          await sendOrderWebPush(
            order,
            "price_approval_requested",
            "موافقتك مطلوبة على السعر",
            `راجع سعر الطلب رقم ${order.barcode} واضغط موافق أو غير موافق.`,
          ).catch(() => undefined);
        }
        return order;
      }),

    archive: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive(), archived: z.boolean().default(true) }))
      .mutation(async ({ input, ctx }) => {
        await requireOwnerBranchOrder(input.id, ctx.ownerBranch.branchId);
        await setOrderArchived(input.id, input.archived);
        return { success: true as const };
      }),

    archiveMany: ownerBranchProcedure
      .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(200), archived: z.boolean() }).strict())
      .mutation(async ({ input, ctx }) => {
        const ids = Array.from(new Set(input.ids));
        for (const id of ids) await requireOwnerBranchOrder(id, ctx.ownerBranch.branchId);
        const result = await setOrdersArchived(ids, input.archived, { type: "owner", branchId: ctx.ownerBranch.branchId });
        await writeAuditLog(
          { type: "owner", branchId: ctx.ownerBranch.branchId },
          input.archived ? "orders.bulk_archived" : "orders.bulk_restored",
          "service_order_batch",
          undefined,
          { ids, count: result.count },
        );
        return result;
      }),

    delete: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        await requireOwnerBranchOrder(input.id, ctx.ownerBranch.branchId);
        await setOrderArchived(input.id, true);
        return { success: true as const };
      }),

    getMessages: ownerBranchProcedure
      .input(z.object({ orderId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        await requireOwnerBranchOrder(input.orderId, ctx.ownerBranch.branchId);
        return getOrderNotifications(input.orderId);
      }),

    uploadPhoto: ownerBranchProcedure
      .input(
        z.object({
          orderId: z.number().int().positive(),
          dataUrl: z.string().min(100).max(8_400_000),
          caption: z.string().trim().max(255).optional(),
          visibleToCustomer: z.boolean().default(false),
        }).strict(),
      )
      .mutation(async ({ input, ctx }) => {
        const order = await requireOwnerBranchOrder(input.orderId, ctx.ownerBranch.branchId);

        const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl);
        if (!match) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "نوع الصورة غير مدعوم" });
        }

        const mimeType = match[1];
        const fileBuffer = Buffer.from(match[2], "base64");
        if (fileBuffer.length > 6 * 1024 * 1024) {
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "حجم الصورة يجب ألا يتجاوز 6 ميجابايت" });
        }
        if (!hasExpectedImageSignature(fileBuffer, mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "محتوى الصورة لا يطابق نوع الملف" });

        const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
        const uploaded = await storagePut(
          `orders/${input.orderId}/${Date.now()}.${extension}`,
          fileBuffer,
          mimeType,
        );
        const photos = await addOrderPhoto({
          orderId: input.orderId,
          storageKey: uploaded.key,
          url: uploaded.url,
          caption: input.caption?.trim() || undefined,
          visibleToCustomer: input.visibleToCustomer,
        });
        await writeAuditLog(
          { type: "owner", branchId: order.branchId },
          "order.photo.uploaded",
          "service_order",
          order.id,
          { photoKey: uploaded.key },
        );
        return photos;
      }),

    setPhotoVisibility: ownerBranchProcedure
      .input(
        z.object({
          orderId: z.number().int().positive(),
          photoId: z.number().int().positive(),
          visibleToCustomer: z.boolean(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        await requireOwnerBranchOrder(input.orderId, ctx.ownerBranch.branchId);
        const bundle = await getOwnerOrderBundle(input.orderId);
        if (!bundle?.photos.some(photo => photo.id === input.photoId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "الصورة غير موجودة في هذا الطلب" });
        }
        await updateOrderPhotoVisibility(input.photoId, input.visibleToCustomer);
        return { success: true as const };
      }),

    deletePhoto: ownerBranchProcedure
      .input(
        z.object({
          orderId: z.number().int().positive(),
          photoId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        await requireOwnerBranchOrder(input.orderId, ctx.ownerBranch.branchId);
        const bundle = await getOwnerOrderBundle(input.orderId);
        if (!bundle?.photos.some(photo => photo.id === input.photoId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "الصورة غير موجودة في هذا الطلب" });
        }
        await deleteOrderPhoto(input.photoId);
        return { success: true as const };
      }),

    prepareWhatsapp: ownerBranchProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          message: z.string().min(1).max(2000),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const order = await requireOwnerBranchOrder(input.id, ctx.ownerBranch.branchId);
        if (!order.customerPhone) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "لا يوجد رقم جوال لهذا الطلب" });
        }
        await queueWhatsAppNotification(order, "custom_message", input.message);
        return { manualUrl: buildManualWhatsAppUrl(order.customerPhone, input.message) };
      }),

    getInvoice: publicProcedure
      .input(z.object({ token: z.string().min(16).max(64) }))
      .query(async ({ input }) => {
        const bundle = await getCustomerOrderBundle({ token: input.token, includeArchived: true });
        if (!bundle) return undefined;
        const globalSettings = toPublicShopSettings(await getShopSettings());
        const branch = await getBranchById(bundle.order.branchId);
        const settings = branch?.settings
          ? {
              ...globalSettings,
              shopName: branch.settings.displayName ?? globalSettings.shopName,
              subtitle: branch.name,
              phone: branch.settings.phone ?? globalSettings.phone,
              whatsappPhone: branch.settings.whatsappPhone ?? globalSettings.whatsappPhone,
              address: branch.settings.address ?? globalSettings.address,
              mapUrl: branch.settings.mapUrl ?? globalSettings.mapUrl,
              openingHours: branch.settings.openingHours ?? globalSettings.openingHours,
              warrantyPolicy: branch.settings.warrantyPolicy ?? globalSettings.warrantyPolicy,
              currency: branch.settings.currency,
            }
          : globalSettings;
        return {
          ...bundle,
          settings,
          branch: branch ? { id: branch.id, name: branch.name, slug: branch.slug, code: branch.code } : null,
          totals: getInvoiceTotals(bundle.order.price, bundle.order.amountPaid),
        };
      }),
  }),

  content: router({
    public: publicProcedure
      .input(z.object({ branchId: z.number().int().positive().optional() }).optional())
      .query(async ({ input }) => {
        const { getAllSiteContent } = await import("./db");
        const items = await getAllSiteContent(input?.branchId);
        const values: Record<string, string> = {};
        for (const item of items) if (!(item.contentKey in values)) values[item.contentKey] = item.value;
        return values;
      }),
    getAll: ownerBranchProcedure
      .input(z.object({ branchId: z.number().int().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (input?.branchId && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن عرض نصوص فرع آخر" });
        const { getAllSiteContent } = await import("./db");
        return getAllSiteContent(ctx.ownerBranch.branchId);
      }),

    getByCategory: ownerBranchProcedure
      .input(
        z.object({
          category: z.string().min(1).max(80),
          branchId: z.number().int().optional(),
        }),
      )
      .query(async ({ input, ctx }) => {
        if (input.branchId && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن عرض نصوص فرع آخر" });
        const { getSiteContentByCategory } = await import("./db");
        return getSiteContentByCategory(input.category, ctx.ownerBranch.branchId);
      }),

    get: ownerBranchProcedure
      .input(
        z.object({
          contentKey: z.string().min(1).max(120),
          branchId: z.number().int().optional(),
        }),
      )
      .query(async ({ input, ctx }) => {
        if (input.branchId && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن عرض نص فرع آخر" });
        const { getSiteContent } = await import("./db");
        return getSiteContent(input.contentKey, ctx.ownerBranch.branchId);
      }),

    update: ownerBranchProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          value: z.string().min(1).max(10000),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { getSiteContentById, updateSiteContent } = await import("./db");
        const existing = await getSiteContentById(input.id);
        if (!existing || (existing.branchId != null && existing.branchId !== ctx.ownerBranch.branchId)) throw new TRPCError({ code: "NOT_FOUND", message: "المحتوى غير موجود في الفرع المفتوح" });
        const result = await updateSiteContent(input.id, input.value, {
          type: "owner",
        });
        if (!result) {
          throw new TRPCError({ code: "NOT_FOUND", message: "المحتوى غير موجود" });
        }
        return result;
      }),

    initialize: ownerBranchProcedure.mutation(async () => {
      const { initializeSiteContent } = await import("./db");
      await initializeSiteContent();
      return { success: true as const };
    }),
  }),
});

export type AppRouter = typeof appRouter;
