import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../client/src/pages/Dashboard.tsx", import.meta.url), "utf8");
const staff = readFileSync(new URL("../client/src/pages/StaffPortal.tsx", import.meta.url), "utf8");
const track = readFileSync(new URL("../client/src/pages/TrackOrder.tsx", import.meta.url), "utf8");
const customer = readFileSync(new URL("../client/src/pages/CustomerPortal.tsx", import.meta.url), "utf8");
const proposal = readFileSync(new URL("../client/src/components/AdditionalRepairOwnerPanel.tsx", import.meta.url), "utf8");
const invoice = readFileSync(new URL("../client/src/pages/Invoice.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");

describe("comprehensive issue-file UI fixes", () => {
  it("uses wide invoice forms and clearly highlights the internal device location", () => {
    expect(dashboard).toContain('max-w-6xl overflow-y-auto');
    expect(staff).toContain('max-w-6xl overflow-y-auto');
    expect(dashboard).toContain("مكان الجهاز داخليًا — لا يظهر للعميل");
    expect(staff).toContain("مكان الجهاز داخليًا — لا يظهر للعميل");
    expect(dashboard).toContain("border-2 border-amber-300 bg-amber-50");
    expect(staff).toContain("عند ياسر / الرف الثاني / ناقص قطعة / يخلص بعد ساعة");
  });

  it("shows the additional fault fields conditionally and exposes the quick increase indicator", () => {
    expect(proposal).toContain("defaultOpen");
    expect(proposal).toContain("إضافة عطل إضافي");
    expect(dashboard).toContain("إضافة عطل أو زيادة سريعة");
    expect(proposal).toContain("السعر لا يتغير إلا بعد موافقة العميل");
    expect(dashboard).toContain("pendingProposalCounts");
    expect(dashboard).toContain("زيادة تنتظر الموافقة");
    expect(dashboard).toContain("bg-red-600");
  });

  it("places open follow-up invoices directly below the create action", () => {
    const createIndex = dashboard.indexOf('data-testid="dashboard-primary-create-invoice"');
    const followUpIndex = dashboard.indexOf('data-testid="dashboard-follow-up-orders"');
    const alertsIndex = dashboard.indexOf("<OwnerInternalAlertsPanel", followUpIndex);
    expect(createIndex).toBeGreaterThan(-1);
    expect(followUpIndex).toBeGreaterThan(createIndex);
    expect(followUpIndex).toBeLessThan(alertsIndex);
    expect(dashboard).toContain('order.status !== "delivered" && order.status !== "cancelled"');
    expect(dashboard).toContain("فواتير تحتاج متابعة");
    expect(dashboard).toContain("تغيير الحالة");
    expect(dashboard).toContain("عرض وتعديل");
    expect(dashboard).toContain("عطل أو زيادة");
  });

  it("refreshes visible order data automatically without polling in the background", () => {
    for (const source of [dashboard, staff, track, customer]) {
      expect(source).toContain("refetchInterval");
      expect(source).toContain("refetchIntervalInBackground: false");
      expect(source).toContain("refetchOnWindowFocus: true");
    }
  });

  it("protects unsaved owner and staff edits with optimistic concurrency", () => {
    for (const source of [dashboard, staff]) {
      expect(source).toContain("expectedUpdatedAt");
      expect(source).toContain("editDirty");
      expect(source).toContain("تعديلات غير محفوظة");
      expect(source).toContain("دون حفظ");
    }
  });

  it("supports historical invoice URLs while keeping the secret token requirement", () => {
    expect(invoice).toContain('search.get("t")');
    expect(invoice).toContain('search.get("token")');
    expect(invoice).toContain('search.get("publicToken")');
    expect(invoice).toContain("params.token");
    expect(app).toContain('/invoice/:token');
    expect(invoice).toContain("token.length >= 16");
  });

  it("offers selected bulk archive and restore without hard-delete wording", () => {
    expect(dashboard).toContain("archiveManyMutation");
    expect(dashboard).toContain("تحديد كل النتائج الحالية");
    expect(dashboard).toContain("أرشفة المحدد");
    expect(dashboard).toContain("استعادة المحدد");
    expect(dashboard).toContain("لن يتم حذف أي فاتورة نهائيًا");
  });
});
