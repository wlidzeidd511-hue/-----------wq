import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../client/src/pages/Invoice.tsx", import.meta.url), "utf8");

describe("Invoice tracking codes", () => {
  it("prints one secure tracking URL in both QR and CODE128 barcode", () => {
    expect(source).toContain('const trackingUrl = buildPublicUrl(`/track?t=${order.publicToken}`)');
    expect(source).toContain('<Barcode value={trackingUrl}');
    expect(source).toContain('<QRCodeSVG value={trackingUrl}');
    expect(source.match(/href=\{trackingUrl\}/g)).toHaveLength(2);
  });

  it("keeps a visible invoice print action", () => {
    expect(source).toContain("window.print()");
    expect(source).toContain("طباعة الفاتورة");
  });

  it("prints the official shop logo above the tracking barcode without splitting the block", () => {
    expect(source).toContain("STORE_LOGO_URL");
    expect(source).toContain('alt="شعار هاتف التميز للاتصالات فوق باركود الفاتورة"');
    expect(source).toContain("invoice-tracking-logo");
    expect(source).toContain("break-inside-avoid rounded-2xl");
    expect(source.indexOf("STORE_LOGO_URL")).toBeLessThan(source.indexOf("<Barcode value={trackingUrl}"));
    expect(source).toContain("فاتورة #{order.barcode} · امسح الباركود");
  });

  it("uses a dedicated 80mm thermal roll sheet with the logo, barcode, QR, and order number", () => {
    expect(source).toContain('className="invoice-print-sheet');
    expect(source).toContain('w-[76mm]');
    expect(source).toContain('max-w-[68mm]');
    expect(source).toContain('alt="شعار هاتف التميز"');
    expect(source).toContain('<Barcode value={trackingUrl}');
    expect(source).toContain('<QRCodeSVG value={trackingUrl}');
    expect(source).toContain("#{order.barcode}");
    expect(source).toContain("من 4 عصرًا إلى 12 ليلًا");
    expect(source).toContain("دامك عندنا، مالك إلا الي يرضيك");
    expect(source).toContain("formatWarrantyYears(order.warrantyDays)");
    expect(source).toContain("formatHoursFromMinutes(minutes)");
    const thermalSheet = source.slice(source.indexOf('className="invoice-print-sheet'));
    expect(thermalSheet).not.toContain("{trackingUrl}</");
  });
});
