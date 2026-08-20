import webpush from "web-push";
import type { ServiceOrder } from "../drizzle/schema";
import { STORE_APP_ICON_URL } from "../shared/siteConfig";
import { listActivePushBindingsForOrder, markWebPushFailure, markWebPushSuccess, recordWebPushDelivery } from "./webPushDb";

const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "";
const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "";
const subject = process.env.WEB_PUSH_VAPID_SUBJECT ?? "https://hatfaltmyez.com";
const configured = Boolean(publicKey && privateKey && subject);

if (configured) webpush.setVapidDetails(subject, publicKey, privateKey);

export function getWebPushPublicConfig() {
  return { enabled: configured, publicKey };
}

export async function sendOrderWebPush(
  order: Pick<ServiceOrder, "id" | "branchId" | "customerId" | "publicToken" | "barcode">,
  eventType: string,
  title: string,
  body: string,
) {
  if (!configured) return { sent: 0, failed: 0, skipped: true };
  const subscriptions = await listActivePushBindingsForOrder(order);
  if (!subscriptions.length) return { sent: 0, failed: 0, skipped: true };

  const payload = JSON.stringify({
    title,
    body,
    eventType,
    orderId: order.id,
    url: `/track?t=${encodeURIComponent(order.publicToken)}`,
    tag: `order-${order.id}`,
    icon: STORE_APP_ICON_URL,
  });
  let sent = 0;
  let failed = 0;

  await Promise.all(subscriptions.map(async subscription => {
    try {
      const response = await webpush.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 86_400, urgency: "high", topic: `order-${order.id}`.slice(0, 32) });
      sent += 1;
      await Promise.all([
        markWebPushSuccess(subscription.id),
        recordWebPushDelivery({ subscriptionId: subscription.id, orderId: order.id, branchId: order.branchId, eventType, title, status: "sent", responseStatus: response.statusCode }),
      ]);
    } catch (error) {
      failed += 1;
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : null;
      const message = error instanceof Error ? error.message : "تعذر إرسال الإشعار";
      const expired = statusCode === 404 || statusCode === 410;
      await Promise.all([
        markWebPushFailure(subscription.id, message, expired),
        recordWebPushDelivery({ subscriptionId: subscription.id, orderId: order.id, branchId: order.branchId, eventType, title, status: "failed", responseStatus: statusCode, failureReason: message }),
      ]);
    }
  }));

  return { sent, failed, skipped: false };
}
