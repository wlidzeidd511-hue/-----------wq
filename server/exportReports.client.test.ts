import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import {
  exportFinancialExcel,
  exportFinancialWord,
  exportInvoicesExcel,
  exportInvoicesWord,
  type ExportContext,
  type ExportOrder,
} from "../client/src/lib/exportReports";

const orders: ExportOrder[] = [
  {
    id: 101,
    branchId: 1,
    barcode: "INV-101",
    serviceType: "maintenance",
    deviceInfo: "iPhone 14",
    reportedIssue: "الشاشة لا تعمل",
    deviceBrand: "Apple",
    deviceModel: "14",
    serialNumber: "SERIAL-101",
    status: "delivered",
    price: 50000,
    cost: 20000,
    amountPaid: 35000,
    paymentStatus: "partial",
    customerName: "عميل اختبار",
    customerPhone: "0500000000",
    warrantyDays: 30,
    createdAt: new Date("2026-08-05T12:00:00Z"),
  },
];

const context: ExportContext = {
  shopName: "هاتف التميز",
  scopeName: "فرع البساتين",
  currency: "ر.س",
  branchNames: new Map([[1, "فرع البساتين"]]),
  generatedAt: new Date("2026-08-05T15:00:00Z"),
};

const report = {
  todayRevenue: 50000,
  todayCost: 20000,
  todayProfit: 30000,
  revenue: 50000,
  cost: 20000,
  profit: 30000,
  unpaid: 15000,
  averageInvoiceValue: 50000,
};

let capturedBlobs: Blob[] = [];
let filenames: string[] = [];

beforeEach(() => {
  capturedBlobs = [];
  filenames = [];
  const anchor = {
    href: "",
    download: "",
    click() { filenames.push(this.download); },
    remove: vi.fn(),
  };
  vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild: vi.fn() } });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((blob: Blob) => { capturedBlobs.push(blob); return "blob:export-test"; }) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => vi.unstubAllGlobals());

describe("Excel and Word exports", () => {
  it("creates a styled auditable invoice workbook and a Word document", async () => {
    await exportInvoicesExcel(orders, context);
    expect(filenames[0]).toMatch(/^invoices-.*\.xlsx$/);
    expect(capturedBlobs[0].type).toContain("spreadsheetml");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await capturedBlobs[0].arrayBuffer());
    const sheet = workbook.getWorksheet("الفواتير");
    expect(sheet?.getCell("C3").value).toBe("الفواتير");
    expect(sheet?.getCell("C9").value).toBe("INV-101");
    expect(sheet?.getCell("O9").value).toBe(500);
    expect(sheet?.getCell("O9").font.color).toMatchObject({ argb: "FF0000FF" });
    expect(String(sheet?.getCell("C9").note)).toContain("قاعدة بيانات هاتف التميز");

    await exportInvoicesWord(orders, context);
    expect(filenames[1]).toMatch(/^invoices-.*\.docx$/);
    const wordBytes = new Uint8Array(await capturedBlobs[1].arrayBuffer());
    expect(String.fromCharCode(wordBytes[0], wordBytes[1])).toBe("PK");
    expect(wordBytes.length).toBeGreaterThan(1_000);
  }, 60_000);

  it("creates financial Excel and Word reports only from the supplied protected report", async () => {
    await exportFinancialExcel(orders, report, context);
    expect(filenames[0]).toMatch(/^financial-report-.*\.xlsx$/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await capturedBlobs[0].arrayBuffer());
    expect(workbook.getWorksheet("التقرير المالي")?.getCell("D9").value).toBe(500);
    expect(workbook.getWorksheet("تفاصيل الطلبات")?.getCell("H9").value).toBe(500);

    await exportFinancialWord(orders, report, context);
    expect(filenames[1]).toMatch(/^financial-report-.*\.docx$/);
    const wordBytes = new Uint8Array(await capturedBlobs[1].arrayBuffer());
    expect(String.fromCharCode(wordBytes[0], wordBytes[1])).toBe("PK");
    expect(wordBytes.length).toBeGreaterThan(1_000);
  }, 60_000);
});
