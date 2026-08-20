import type { ServiceOrder } from "../drizzle/schema";
import { createNotificationRecord } from "./db";

export type WhatsAppEvent =
  | "account_created"
  | "invoice_created"
  | "order_created"
  | "status_pending"
  | "status_diagnosing"
  | "status_awaiting_approval"
  | "status_in_progress"
  | "status_ready"
  | "status_delivered"
  | "status_cancelled"
  | "warranty_activated"
  | "scratch_win"
  | "price_approval_requested"
  | "additional_repair_proposed"
  | "additional_repair_approved"
  | "additional_repair_rejected"
  | "custom_message";

const templateKeys: Partial<Record<WhatsAppEvent, string>> = {
  account_created: "account_created",
  invoice_created: "invoice_created",
  status_ready: "order_ready",
  status_delivered: "order_delivered",
  warranty_activated: "warranty_activated",
  scratch_win: "scratch_won",
};

function renderTemplate(template: string, variables: Record<string, string | number>) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
  ));
}

export function normalizeWhatsAppPhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10) digits = `966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) digits = `966${digits}`;
  return digits;
}

export function buildManualWhatsAppUrl(phone: string, message: string) {
  return `https://wa.me/${normalizeWhatsAppPhone(phone)}?text=${encodeURIComponent(message)}`;
}

export async function queueWhatsAppNotification(
  order: Pick<ServiceOrder, "id" | "branchId" | "customerId" | "customerPhone">,
  eventType: WhatsAppEvent,
  fallbackMessage: string,
  variables: Record<string, string | number> = {},
) {
  if (!order.customerPhone) return null;

  const templateKey = templateKeys[eventType] ?? eventType;
  const { getWhatsappTemplate } = await import("./platformDb");
  const template = await getWhatsappTemplate(order.branchId, templateKey);
  const message = template ? renderTemplate(template.bodyPreview, variables) : fallbackMessage;

  await createNotificationRecord({
    orderId: order.id,
    branchId: order.branchId,
    customerId: order.customerId ?? undefined,
    eventType,
    templateKey,
    recipient: order.customerPhone,
    message,
    status: "requires_setup",
    failureReason: "الإرسال التلقائي ينتظر بيانات WhatsApp Business؛ يمكن الإرسال يدويًا من لوحة المالك.",
  });

  return {
    manualUrl: buildManualWhatsAppUrl(order.customerPhone, message),
    status: "requires_setup" as const,
  };
}
