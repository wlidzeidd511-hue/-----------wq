import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createOrGetCustomer, findCustomerByPhone, getCustomerById } from "../accountDb";
import { staffPermissionProcedure, staffProcedure, router } from "../_core/trpc";
import {
  addOrderPhoto,
  createServiceOrder,
  getOrderPhotos,
  getServiceOrderById,
  listCustomerOrdersForOwnerBranch,
  listServiceOrders,
  updateServiceOrderDetails,
} from "../db";
import { queueWhatsAppNotification } from "../notifications";
import { writeAuditLog } from "../platformDb";
import { ORDER_STATUS_VALUES, transitionOrderStatus } from "../orderStatusWorkflow";
import { storagePut } from "../storage";

const optionalText = (max: number) => z.string().trim().max(max).optional();
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const phoneSchema = z.string().trim().min(8).max(30).regex(/^[+0-9 ()-]+$/, "صيغة رقم الجوال غير صحيحة");
const statusSchema = z.enum(ORDER_STATUS_VALUES);

function hasExpectedImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function toStaffOrder<T extends Record<string, unknown>>(order: T, permissions: readonly string[]) {
  const safeRecord = { ...order } as Record<string, unknown>;
  if (!permissions.includes("orders.view_prices")) {
    if ("price" in safeRecord) safeRecord.price = 0;
    if ("amountPaid" in safeRecord) safeRecord.amountPaid = 0;
    delete safeRecord.cost;
  }
  if (!permissions.includes("orders.view_internal_notes")) delete safeRecord.internalNotes;
  return safeRecord as T;
}

export const staffRouter = router({
  summary: staffPermissionProcedure("orders.view_branch").query(async ({ ctx }) => {
    const orders = await listServiceOrders({ branchId: ctx.staff.branchId, archived: false });
    return {
      staff: ctx.staff,
      total: orders.length,
      active: orders.filter(order => !["delivered", "cancelled"].includes(order.status)).length,
      ready: orders.filter(order => order.status === "ready").length,
    };
  }),

  customers: router({
    searchByPhone: staffPermissionProcedure("customers.view")
      .input(z.object({ phone: phoneSchema }).strict())
      .query(async ({ input, ctx }) => {
        const record = await findCustomerByPhone(input.phone);
        if (!record) return { customer: null, orders: [] };
        const branchOrders = await listCustomerOrdersForOwnerBranch(record.id, ctx.staff.branchId);
        if (!branchOrders.length) return { customer: null, orders: [] };
        const customer = await getCustomerById(record.id);
        if (!customer) return { customer: null, orders: [] };
        return {
          customer: { id: customer.id, name: customer.name, phoneDisplay: customer.phoneDisplay },
          orders: branchOrders.map(order => toStaffOrder({
            id: order.id,
            barcode: order.barcode,
            serviceType: order.serviceType,
            deviceInfo: order.deviceInfo,
            status: order.status,
            price: order.price,
            amountPaid: order.amountPaid,
            warrantyDays: order.warrantyDays,
            warrantyExpiresAt: order.warrantyExpiresAt,
            archived: order.archived,
            createdAt: order.createdAt,
            deliveredAt: order.deliveredAt,
          }, ctx.staff.permissionsList)),
        };
      }),
  }),

  orders: router({
    list: staffPermissionProcedure("orders.view_branch")
      .input(z.object({ search: z.string().trim().max(255).optional(), archived: z.boolean().default(false) }).strict().optional())
      .query(async ({ input, ctx }) => {
        const orders = await listServiceOrders({
          branchId: ctx.staff.branchId,
          search: input?.search,
          archived: input?.archived ?? false,
        });
        return orders.map(order => toStaffOrder(order, ctx.staff.permissionsList));
      }),

    get: staffPermissionProcedure("orders.view_branch")
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const order = await getServiceOrderById(input.id);
        if (!order || order.branchId !== ctx.staff.branchId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود في فرعك" });
        }
        const photos = ctx.staff.permissionsList.includes("photos.view") ? await getOrderPhotos(order.id) : [];
        return { order: toStaffOrder(order, ctx.staff.permissionsList), photos };
      }),

    create: staffPermissionProcedure("orders.create")
      .input(z.object({
        serviceType: z.enum(["maintenance", "programming"]),
        deviceInfo: z.string().trim().min(1).max(2000),
        reportedIssue: optionalText(255),
        deviceBrand: optionalText(100),
        deviceModel: optionalText(100),
        serialNumber: optionalText(160),
        receivedAccessories: optionalText(2000),
        intakeCondition: optionalText(2000),
        customerName: z.string().trim().min(1).max(255),
        customerPhone: phoneSchema,
        customerVisibleNotes: optionalText(4000),
        deviceLocation: optionalText(500),
        price: z.number().int().nonnegative().default(0),
        cost: z.number().int().nonnegative().default(0),
        amountPaid: z.number().int().nonnegative().default(0),
        estimatedTime: z.number().int().nonnegative().default(0),
        warrantyDays: z.number().int().min(0).max(3650).default(30),
        requestPriceApproval: z.boolean().default(false),
      }).strict())
      .mutation(async ({ input, ctx }) => {
        const existingCustomer = await findCustomerByPhone(input.customerPhone);
        if (!existingCustomer && !ctx.staff.permissionsList.includes("customers.create")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "العميل غير موجود وليست لديك صلاحية إنشاء حساب عميل جديد" });
        }
        const canViewPrices = ctx.staff.permissionsList.includes("orders.view_prices");
        if (canViewPrices && input.requestPriceApproval && input.price <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "يلزم سعر أكبر من صفر لإرسال الموافقة" });
        }
        const safeFinancialInput = canViewPrices
          ? input
          : { ...input, price: 0, cost: 0, amountPaid: 0, requestPriceApproval: false };
        const customerAccount = await createOrGetCustomer({
          phone: safeFinancialInput.customerPhone,
          name: safeFinancialInput.customerName,
          whatsappOptIn: true,
        });
        const order = await createServiceOrder({
          ...safeFinancialInput,
          branchId: ctx.staff.branchId,
          customerId: customerAccount.customer.id,
          createdByStaffId: ctx.staff.id,
          receivedByStaffId: ctx.staff.id,
        });
        await writeAuditLog(
          { type: "staff", id: ctx.staff.id, branchId: ctx.staff.branchId },
          "order.created",
          "service_order",
          order.id,
          { barcode: order.barcode },
        );
        if (customerAccount.created && customerAccount.temporaryPassword) {
          await queueWhatsAppNotification(
            order,
            "account_created",
            `تم إنشاء حسابك في هاتف التميز. رقم الجوال: ${order.customerPhone}، كلمة المرور المؤقتة: ${customerAccount.temporaryPassword}`,
          );
        }
        await queueWhatsAppNotification(order, "invoice_created", `تم إنشاء فاتورة رقم ${order.barcode}.`);
        if (safeFinancialInput.requestPriceApproval) {
          await queueWhatsAppNotification(
            order,
            "price_approval_requested",
            `نرجو مراجعة السعر والموافقة عليه لطلب رقم ${order.barcode}`,
          );
        }
        return {
          order: toStaffOrder(order, ctx.staff.permissionsList),
          customerAccountCreated: customerAccount.created,
          temporaryPassword: customerAccount.temporaryPassword,
        };
      }),

    updateIntake: staffPermissionProcedure("orders.update_intake")
      .input(z.object({
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
        deviceLocation: nullableText(500),
        price: z.number().int().nonnegative().optional(),
        cost: z.number().int().nonnegative().optional(),
        amountPaid: z.number().int().nonnegative().optional(),
        estimatedTime: z.number().int().nonnegative().optional(),
        warrantyDays: z.number().int().min(0).max(3650).optional(),
        expectedUpdatedAt: z.number().int().nonnegative().optional(),
      }).strict())
      .mutation(async ({ input, ctx }) => {
        const order = await getServiceOrderById(input.id);
        if (!order || order.branchId !== ctx.staff.branchId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود في فرعك" });
        }
        const { id, expectedUpdatedAt, ...updates } = input;
        const includesFinancialUpdate = updates.price !== undefined || updates.cost !== undefined || updates.amountPaid !== undefined;
        if (includesFinancialUpdate && !ctx.staff.permissionsList.includes("orders.view_prices")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "ليست لديك صلاحية تعديل السعر أو المدفوع أو التكلفة" });
        }
        if (expectedUpdatedAt !== undefined && new Date(order.updatedAt).getTime() !== expectedUpdatedAt) {
          throw new TRPCError({ code: "CONFLICT", message: "تم تعديل الفاتورة من مستخدم آخر. بياناتك لم تُحذف؛ أعد فتح الفاتورة وراجع آخر نسخة." });
        }
        if (updates.customerPhone !== undefined && updates.customerPhone !== order.customerPhone && !ctx.staff.permissionsList.includes("customers.create")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "ليست لديك صلاحية تغيير العميل المرتبط بالفاتورة" });
        }
        const customerAccount = updates.customerPhone
          ? await createOrGetCustomer({
              phone: updates.customerPhone,
              name: updates.customerName,
              whatsappOptIn: true,
            })
          : null;
        const updated = await updateServiceOrderDetails(
          id,
          {
            ...updates,
            ...(updates.customerPhone === null
              ? { customerId: null }
              : customerAccount
                ? { customerId: customerAccount.customer.id }
                : {}),
          },
          { type: "staff", id: ctx.staff.id, name: ctx.staff.name, branchId: ctx.staff.branchId },
        );
        await writeAuditLog(
          { type: "staff", id: ctx.staff.id, branchId: ctx.staff.branchId },
          "order.intake.updated",
          "service_order",
          id,
        );
        return updated ? toStaffOrder(updated, ctx.staff.permissionsList) : undefined;
      }),

    updateStatus: staffPermissionProcedure("orders.update_status")
      .input(z.object({
        id: z.number().int().positive(),
        status: statusSchema,
        note: optionalText(2000),
        visibleToCustomer: z.boolean().default(true),
      }).strict())
      .mutation(async ({ input, ctx }) => transitionOrderStatus({
        orderId: input.id,
        branchId: ctx.staff.branchId,
        status: input.status,
        note: input.note,
        visibleToCustomer: input.visibleToCustomer,
        actor: { type: "staff", id: ctx.staff.id, branchId: ctx.staff.branchId },
      })),

    uploadPhoto: staffPermissionProcedure("photos.upload")
      .input(z.object({
        orderId: z.number().int().positive(),
        dataUrl: z.string().min(100).max(8_400_000),
        caption: z.string().trim().max(255).optional(),
        visibleToCustomer: z.boolean().default(false),
      }).strict())
      .mutation(async ({ input, ctx }) => {
        const order = await getServiceOrderById(input.orderId);
        if (!order || order.branchId !== ctx.staff.branchId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود في فرعك" });
        }
        const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl);
        if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "نوع الصورة غير مدعوم" });
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
          uploadedByStaffId: ctx.staff.id,
        });
        await writeAuditLog(
          { type: "staff", id: ctx.staff.id, branchId: ctx.staff.branchId },
          "order.photo.uploaded",
          "service_order",
          input.orderId,
          { photoKey: uploaded.key },
        );
        return photos;
      }),
  }),
});
