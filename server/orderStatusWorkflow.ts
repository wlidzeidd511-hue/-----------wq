import { TRPCError } from "@trpc/server";
import { getServiceOrderById, updateServiceOrderStatus } from "./db";
import { queueWhatsAppNotification } from "./notifications";
import { getBranchById, type AuditActor, writeAuditLog } from "./platformDb";
import { assignScratchCodeToOrder } from "./scratchDb";
import { sendOrderWebPush } from "./webPush";

export const ORDER_STATUS_VALUES = [
  "pending",
  "diagnosing",
  "awaiting_approval",
  "in_progress",
  "ready",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

export async function transitionOrderStatus(input: {
  orderId: number;
  branchId: number;
  status: OrderStatus;
  note?: string;
  visibleToCustomer: boolean;
  actor: AuditActor;
}) {
  const previousOrder = await getServiceOrderById(input.orderId);
  if (!previousOrder || previousOrder.branchId !== input.branchId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود في فرعك" });
  }
  if (previousOrder.status === input.status) return previousOrder;

  const order = await updateServiceOrderStatus(
    input.orderId,
    input.status,
    input.note,
    input.visibleToCustomer,
  );
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "تعذر تحديث الطلب" });

  await writeAuditLog(input.actor, "order.status.updated", "service_order", order.id, {
    previousStatus: previousOrder.status,
    status: input.status,
  });

  const branch = await getBranchById(order.branchId);
  const branchName = branch?.name ?? "هاتف التميز";
  const labels: Record<OrderStatus, string> = {
    pending: "تم استلام جهازك",
    diagnosing: "جهازك قيد الفحص",
    awaiting_approval: "بانتظار موافقتك على السعر",
    in_progress: "بدأ العمل على جهازك",
    ready: "جهازك جاهز للاستلام",
    delivered: "تم تسليم الجهاز",
    cancelled: "تم إلغاء الطلب",
  };

  if (order.customerPhone) {
    await queueWhatsAppNotification(
      order,
      `status_${input.status}`,
      `${labels[input.status]}. رقم الطلب: ${order.barcode}`,
      {
        order_number: order.barcode,
        branch_name: branchName,
        warranty_days: order.warrantyDays,
        warranty_date: order.warrantyExpiresAt
          ? new Date(order.warrantyExpiresAt).toLocaleDateString("ar-SA")
          : "غير محدد",
      },
    );
    if (input.status === "delivered") {
      await queueWhatsAppNotification(
        order,
        "warranty_activated",
        `تم تفعيل ضمان الطلب رقم ${order.barcode} لمدة ${order.warrantyDays} يومًا.`,
        {
          order_number: order.barcode,
          branch_name: branchName,
          warranty_days: order.warrantyDays,
          warranty_date: order.warrantyExpiresAt
            ? new Date(order.warrantyExpiresAt).toLocaleDateString("ar-SA")
            : "غير محدد",
        },
      );
    }
  }

  const pushMessages: Record<OrderStatus, { title: string; body: string }> = {
    pending: { title: "تم استلام جهازك", body: `سجلنا طلبك رقم ${order.barcode} بنجاح.` },
    diagnosing: { title: "جهازك قيد الفحص", body: `بدأ فحص جهازك في الطلب رقم ${order.barcode}.` },
    awaiting_approval: { title: "نحتاج موافقتك", body: `راجع سعر الطلب رقم ${order.barcode} واتخذ قرارك.` },
    in_progress: { title: "بدأ العمل على جهازك", body: `جهازك الآن قيد الصيانة في الطلب رقم ${order.barcode}.` },
    ready: { title: "جهازك جاهز للاستلام", body: `أبشرك، الطلب رقم ${order.barcode} صار جاهزًا.` },
    delivered: { title: "تم تسليم جهازك", body: `اكتمل الطلب رقم ${order.barcode} وتم تفعيل الضمان.` },
    cancelled: { title: "تم إلغاء الطلب", body: `تم إلغاء الطلب رقم ${order.barcode}.` },
  };
  const pushMessage = pushMessages[input.status];
  await sendOrderWebPush(order, `status_${input.status}`, pushMessage.title, pushMessage.body).catch(() => undefined);
  if (input.status === "delivered") await assignScratchCodeToOrder(order.id);
  return order;
}
