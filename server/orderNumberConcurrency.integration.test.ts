import { afterEach, describe, expect, it } from "vitest";
import { createServiceOrder, purgeServiceOrdersForTests } from "./db";

const orderIds: number[] = [];

afterEach(async () => {
  await purgeServiceOrdersForTests(orderIds.splice(0));
});

describe("concurrent invoice numbering", () => {
  it("allocates a unique numeric barcode for simultaneous orders", async () => {
    const marker = Date.now();
    const orders = await Promise.all(Array.from({ length: 8 }, (_, index) => createServiceOrder({
      branchId: index % 2 ? 1 : 2,
      serviceType: "maintenance",
      deviceInfo: `جهاز اختبار تكامل مؤقت تزامن ${marker}-${index}`,
      customerName: `عميل تزامن ${index}`,
      price: 0,
    })));
    orderIds.push(...orders.map(order => order.id));
    const barcodes = orders.map(order => order.barcode);
    expect(barcodes.every(barcode => /^\d+$/.test(barcode))).toBe(true);
    expect(new Set(barcodes).size).toBe(orders.length);
  }, 30_000);
});
