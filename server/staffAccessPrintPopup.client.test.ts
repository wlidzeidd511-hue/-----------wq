import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminLoginSource = readFileSync(new URL("../client/src/pages/AdminLogin.tsx", import.meta.url), "utf8");
const ownerControlSource = readFileSync(new URL("../client/src/pages/OwnerControl.tsx", import.meta.url), "utf8");
const staffPortalSource = readFileSync(new URL("../client/src/pages/StaffPortal.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../client/src/pages/Dashboard.tsx", import.meta.url), "utf8");
const engagementSource = readFileSync(new URL("../client/src/components/OwnerEngagementPanel.tsx", import.meta.url), "utf8");

describe("owner and staff access UX", () => {
  it("offers explicit owner and employee access without exposing external branding", () => {
    expect(adminLoginSource).toContain("دخول المالك");
    expect(adminLoginSource).toContain(">موظف</strong>");
    expect(adminLoginSource).toContain('navigate("/team")');
    expect(adminLoginSource.toLowerCase()).not.toContain("manus");
    expect(adminLoginSource).toContain('onClick={() => navigate("/")}');
    expect(adminLoginSource).toContain("رجوع للصفحة الرئيسية");
    expect(adminLoginSource).toContain('setAccessMode("choice")');
    expect(adminLoginSource).toContain("رجوع لاختيار نوع الحساب");
  });

  it("shows the assigned branch and granted permissions to the employee", () => {
    expect(staffPortalSource).toContain("الفرع المعيّن");
    expect(staffPortalSource).toContain("permissionsList.map");
    expect(staffPortalSource).toContain("تغيير الفرع أو الصلاحيات يتم من المالك");
    expect(staffPortalSource).toContain('href={OWNER_LOGIN_PATH}');
    expect(staffPortalSource).toContain("بحث عن عميل برقم الجوال");
    expect(staffPortalSource).toContain("staff.customers.searchByPhone.useQuery");
    expect(staffPortalSource).toContain("لا يوجد عميل بهذا الرقم داخل فرعك");
    expect(staffPortalSource).toContain("refetchIntervalInBackground: false");
    expect(staffPortalSource).toContain("refetchInterval: 2_500");
    expect(staffPortalSource).toContain('permissionsList.includes("orders.view_branch")');
    expect(staffPortalSource).toContain('permissionsList.includes("orders.update_status")');
    expect(staffPortalSource).toContain('permissionsList.includes("orders.view_prices")');
    expect(staffPortalSource).toContain('permissionsList.includes("orders.view_internal_notes")');
    expect(staffPortalSource).toContain('permissionsList.includes("customers.view")');
    expect(staffPortalSource).toContain('permissionsList.includes("photos.view")');
    expect(staffPortalSource).toContain("staff.orders.updateStatus.useMutation");
    expect(staffPortalSource).toContain("لا توجد لديك صلاحية عرض طلبات الفرع");
    expect(staffPortalSource).toContain("includeFinancials={canViewPrices}");
    expect(staffPortalSource).toContain('label="التكلفة (ريال)"');
    expect(staffPortalSource).toContain('data-testid="staff-invoice-print-button"');
    expect(staffPortalSource).toContain('/invoice?t=${detailQuery.data.order.publicToken}');
    expect(staffPortalSource).toContain('placeholder="مثال: ساعتين، يوم ونص أو أسبوعين"');
    expect(staffPortalSource).toContain('placeholder="مثال: 6 شهور، سنة ونص أو سنتين"');
    expect(staffPortalSource).toContain("canViewInternalNotes && detailQuery.data?.order.internalNotes");
    expect(staffPortalSource).toContain("canViewPhotos &&");
  });

  it("lets the owner transfer a staff account while warning that old sessions are revoked", () => {
    expect(ownerControlSource).toContain("accounts.staff.transferBranch.useMutation");
    expect(ownerControlSource).toContain("نقل الموظف إلى فرع آخر");
    expect(ownerControlSource).toContain("ويبطل جلسته القديمة");
    expect(ownerControlSource).toContain("بيانات الموظف واسم الدخول");
    expect(ownerControlSource).toContain("حفظ بيانات الموظف");
    expect(ownerControlSource).toContain('"orders.update_status": "تغيير حالة الفاتورة"');
    expect(ownerControlSource).toContain('"orders.view_prices": "عرض وإدخال السعر والمدفوع والتكلفة"');
    expect(ownerControlSource).toContain('"customers.view": "البحث عن العملاء وفواتيرهم"');
  });
});

describe("invoice printing and invoice-scoped popups", () => {
  it("places a print button inside order edits and uses the secure invoice token", () => {
    expect(dashboardSource).toContain('data-testid="owner-invoice-print-button"');
    expect(dashboardSource).toContain("طباعة الفاتورة #{detailQuery.data.order.barcode} مع QR والباركود");
    expect(dashboardSource).toContain("/invoice?t=${detailQuery.data.order.publicToken}");
    expect(dashboardSource).not.toContain("fixed bottom-5 left-5");
  });

  it("requires one selected invoice and sends through the order-scoped endpoint", () => {
    expect(engagementSource).toContain("selectedOrderId");
    expect(engagementSource).toContain("engagement.sendToOrder.useMutation");
    expect(engagementSource).toContain("اختر رقم الفاتورة التي تخصها الرسالة");
    expect(engagementSource).toContain("الرسالة لن تظهر في بقية فواتير العميل");
    expect(engagementSource).toContain("sentOpen");
    expect(engagementSource).toContain("enabled: sentOpen");
    expect(engagementSource).toContain("آخر الرسائل المرسلة");
    expect(engagementSource).toContain("فتح السجل");
  });

  it("supports safe bulk archive and restore without hard delete", () => {
    expect(dashboardSource).toContain("orders.archiveMany.useMutation");
    expect(dashboardSource).toContain("تحديد كل النتائج الحالية");
    expect(dashboardSource).toContain("أرشفة المحدد");
    expect(dashboardSource).toContain("استعادة المحدد");
    expect(dashboardSource).toContain("لن يتم حذف أي فاتورة نهائيًا");
  });
});
