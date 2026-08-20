import { and, eq, ne } from "drizzle-orm";
import { serviceOrders } from "../drizzle/schema";
import { getDb } from "./db";
import { getShopSettings } from "./settingsDb";

export type CustomerLoyaltyTier = "new" | "regular" | "distinguished" | "vip";

const tierContent: Record<CustomerLoyaltyTier, { label: string; message: string }> = {
  new: { label: "عميل جديد", message: "يا هلا بك، نورت هاتف التميز لأول مرة 🩵" },
  regular: { label: "عميل دائم", message: "يا هلا بعميلنا الدائم، ثقتك محل تقديرنا 🩵" },
  distinguished: { label: "عميل مميز", message: "نورتنا يا عميلنا المميز، وجودك يسعدنا دائمًا 🩵" },
  vip: { label: "عميل VIP", message: "يا هلا بعميلنا الـ VIP، لك مكانة خاصة عندنا 🩵" },
};

function classifyOrders(
  orders: Array<{ status: string; price: number }>,
  settings: Awaited<ReturnType<typeof getShopSettings>>,
) {
  const orderCount = orders.length;
  const deliveredOrders = orders.filter(order => order.status === "delivered");
  const deliveredCount = deliveredOrders.length;
  const totalDeliveredSpend = deliveredOrders.reduce((sum, order) => sum + order.price, 0);
  let tier: CustomerLoyaltyTier = "new";
  if (totalDeliveredSpend >= settings.loyaltyVipSpendThreshold) tier = "vip";
  else if (totalDeliveredSpend >= settings.loyaltyDistinguishedSpendThreshold) tier = "distinguished";
  else if (orderCount >= settings.loyaltyRegularOrderThreshold) tier = "regular";
  return { tier, ...tierContent[tier], orderCount, deliveredCount, totalDeliveredSpend };
}

export async function getCustomerLoyaltyProfile(customerId: number) {
  const [db, settings] = await Promise.all([getDb(), getShopSettings()]);
  if (!db) throw new Error("Database not available");
  const orders = await db
    .select({ id: serviceOrders.id, status: serviceOrders.status, price: serviceOrders.price })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.customerId, customerId), ne(serviceOrders.status, "cancelled")));
  return classifyOrders(orders, settings);
}

export async function getOrderCustomerLoyaltyProfile(orderId: number) {
  const [db, settings] = await Promise.all([getDb(), getShopSettings()]);
  if (!db) throw new Error("Database not available");
  const [order] = await db.select({ customerId: serviceOrders.customerId, customerPhone: serviceOrders.customerPhone }).from(serviceOrders).where(eq(serviceOrders.id, orderId)).limit(1);
  if (!order) return undefined;
  if (order.customerId) return getCustomerLoyaltyProfile(order.customerId);
  if (!order.customerPhone) return undefined;
  const orders = await db
    .select({ id: serviceOrders.id, status: serviceOrders.status, price: serviceOrders.price })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.customerPhone, order.customerPhone), ne(serviceOrders.status, "cancelled")));
  return classifyOrders(orders, settings);
}
