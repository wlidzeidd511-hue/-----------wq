import { formatEstimatedSchedule, formatWarrantySchedule } from "./serviceDates";

export type ExportOrder = {
  id: number;
  branchId: number;
  barcode: string;
  serviceType: "maintenance" | "programming";
  deviceInfo: string;
  reportedIssue?: string | null;
  deviceBrand?: string | null;
  deviceModel?: string | null;
  serialNumber?: string | null;
  status: string;
  price: number;
  cost: number;
  amountPaid: number;
  paymentStatus: string;
  customerName?: string | null;
  customerPhone?: string | null;
  estimatedTime?: number;
  estimatedCompletionAt?: Date | number | string | null;
  warrantyDays: number;
  warrantyExpiresAt?: Date | number | string | null;
  createdAt: Date | number | string;
  deliveredAt?: Date | number | string | null;
};

export type ExportFinancialReport = {
  todayRevenue: number;
  todayCost: number;
  todayProfit: number;
  revenue: number;
  cost: number;
  profit: number;
  unpaid: number;
  averageInvoiceValue: number;
};

export type ExportContext = {
  shopName: string;
  scopeName: string;
  currency: string;
  branchNames: Map<number, string>;
  generatedAt?: Date;
};

const statusLabels: Record<string, string> = {
  pending: "تم الاستلام",
  diagnosing: "قيد الفحص",
  awaiting_approval: "بانتظار الموافقة",
  in_progress: "جاري العمل",
  ready: "جاهز للاستلام",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

function dateLabel(value: Date | number | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
}

function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function invoiceRows(orders: ExportOrder[], context: ExportContext) {
  return orders.map(order => [
    order.barcode,
    context.branchNames.get(order.branchId) ?? `فرع #${order.branchId}`,
    dateLabel(order.createdAt),
    order.customerName || "بدون اسم",
    order.customerPhone || "—",
    order.serviceType === "maintenance" ? "صيانة" : "برمجة",
    order.deviceInfo,
    order.reportedIssue || "—",
    order.deviceBrand || "—",
    order.deviceModel || "—",
    order.serialNumber || "—",
    statusLabels[order.status] ?? order.status,
    order.price / 100,
    order.amountPaid / 100,
    Math.max(0, order.price - order.amountPaid) / 100,
    formatEstimatedSchedule(order.estimatedTime ?? 0, order.estimatedCompletionAt),
    formatWarrantySchedule(order),
  ]);
}

async function createExcelSheet(title: string, subtitle: string, unit: string) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "هاتف التميز";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(title, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 20 },
    views: [{ rightToLeft: true }],
  });
  sheet.getColumn(1).width = 20;
  sheet.getColumn(2).width = 20;
  sheet.mergeCells("C3:R3");
  const titleCell = sheet.getCell("C3");
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF135B44" } };
  titleCell.alignment = { horizontal: "right", vertical: "middle" };
  sheet.getRow(3).height = 28;
  sheet.getCell("C5").value = subtitle;
  sheet.getCell("C5").font = { bold: true, size: 11, color: { argb: "FF000000" } };
  sheet.getCell("C6").value = unit;
  sheet.getCell("C6").font = { italic: true, color: { argb: "FF555555" } };
  sheet.headerFooter.oddFooter = "&L&F&Cصفحة &P من &N&Rهاتف التميز";
  return { workbook, sheet };
}

function styleTable(sheet: any, headers: string[], rows: Array<Array<string | number>>, sourceLabel: (index: number) => string, currencyColumnIndexes: number[]) {
  const startColumn = 3;
  headers.forEach((header, index) => {
    const cell = sheet.getCell(8, startColumn + index);
    cell.value = header;
    cell.font = { bold: true, color: { argb: "FF000000" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCFE9E0" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF135B44" } } };
  });
  rows.forEach((row, rowIndex) => row.forEach((value, valueIndex) => {
    const cell = sheet.getCell(9 + rowIndex, startColumn + valueIndex);
    cell.value = value;
    cell.font = { color: { argb: "FF0000FF" } };
    cell.alignment = { horizontal: typeof value === "number" ? "right" : "right", vertical: "top", wrapText: true };
    cell.note = sourceLabel(rowIndex);
    if (currencyColumnIndexes.includes(valueIndex)) cell.numFmt = '#,##0.00;[Red](#,##0.00);-';
  }));
  headers.forEach((header, index) => {
    const column = sheet.getColumn(startColumn + index);
    let longest = header.length;
    column.eachCell({ includeEmpty: false }, (cell: any) => { longest = Math.max(longest, String(cell.value ?? "").length); });
    column.width = Math.max(11, Math.min(36, longest + 2));
  });
  const lastRow = Math.max(8, 8 + rows.length);
  sheet.autoFilter = { from: { row: 8, column: startColumn }, to: { row: lastRow, column: startColumn + headers.length - 1 } };
  sheet.pageSetup.printArea = `B2:${sheet.getColumn(startColumn + headers.length - 1).letter}${lastRow}`;
}

export async function exportInvoicesExcel(orders: ExportOrder[], context: ExportContext) {
  const generatedAt = context.generatedAt ?? new Date();
  const { workbook, sheet } = await createExcelSheet("الفواتير", `${context.shopName} — ${context.scopeName} — ${dateLabel(generatedAt)}`, `القيم المالية بـ ${context.currency}`);
  const headers = ["رقم الفاتورة", "الفرع", "التاريخ", "العميل", "الجوال", "الخدمة", "الجهاز", "العطل", "الشركة", "الموديل", "التسلسلي / IMEI", "الحالة", "الإجمالي", "المدفوع", "المتبقي", "الإنجاز المتوقع", "الضمان وبدايته ونهايته"];
  styleTable(sheet, headers, invoiceRows(orders, context), index => `المصدر: قاعدة بيانات هاتف التميز، الفاتورة ${orders[index]?.barcode ?? "—"}، تاريخ الاستخراج ${dateLabel(generatedAt)}.`, [12, 13, 14]);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `invoices-${safeFilePart(context.scopeName)}-${generatedAt.toISOString().slice(0, 10)}.xlsx`);
}

export async function exportFinancialExcel(orders: ExportOrder[], report: ExportFinancialReport, context: ExportContext) {
  const generatedAt = context.generatedAt ?? new Date();
  const { workbook, sheet } = await createExcelSheet("التقرير المالي", `${context.shopName} — ${context.scopeName} — ${dateLabel(generatedAt)}`, `القيم المالية بـ ${context.currency}`);
  const summary = [
    ["مبيعات اليوم", report.todayRevenue / 100], ["تكلفة اليوم", report.todayCost / 100], ["ربح اليوم", report.todayProfit / 100],
    ["مبيعات الشهر", report.revenue / 100], ["تكلفة الشهر", report.cost / 100], ["ربح الشهر", report.profit / 100],
    ["المبالغ المتبقية", report.unpaid / 100], ["متوسط قيمة الفاتورة", report.averageInvoiceValue / 100],
  ];
  styleTable(sheet, ["المؤشر", "القيمة"], summary, () => `المصدر: التقرير المالي في قاعدة بيانات هاتف التميز، تاريخ الاستخراج ${dateLabel(generatedAt)}.`, [1]);
  const details = workbook.addWorksheet("تفاصيل الطلبات", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ rightToLeft: true }] });
  details.getColumn(1).width = 20; details.getColumn(2).width = 20;
  details.mergeCells("C3:L3");
  const title = details.getCell("C3"); title.value = `تفاصيل الأسعار والتكاليف والأرباح — ${context.scopeName}`; title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } }; title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF135B44" } }; title.alignment = { horizontal: "right" };
  details.getCell("C5").value = `تاريخ الاستخراج: ${dateLabel(generatedAt)}`; details.getCell("C5").font = { bold: true };
  details.getCell("C6").value = `القيم المالية بـ ${context.currency}`; details.getCell("C6").font = { italic: true };
  const rows = orders.map(order => [order.barcode, context.branchNames.get(order.branchId) ?? `فرع #${order.branchId}`, order.customerName || "بدون اسم", order.deviceInfo, statusLabels[order.status] ?? order.status, order.price / 100, order.cost / 100, (order.price - order.cost) / 100, order.amountPaid / 100, Math.max(0, order.price - order.amountPaid) / 100]);
  styleTable(details, ["الفاتورة", "الفرع", "العميل", "الجهاز", "الحالة", "السعر", "التكلفة", "الربح", "المدفوع", "المتبقي"], rows, index => `المصدر: قاعدة بيانات هاتف التميز، الفاتورة ${orders[index]?.barcode ?? "—"}، تاريخ الاستخراج ${dateLabel(generatedAt)}.`, [5, 6, 7, 8, 9]);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `financial-report-${safeFilePart(context.scopeName)}-${generatedAt.toISOString().slice(0, 10)}.xlsx`);
}

async function makeWordDocument(title: string, subtitle: string, headers: string[], rows: Array<Array<string | number>>, summary?: Array<[string, string]>) {
  const docx = await import("docx");
  const children: any[] = [
    new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, bidirectional: true, spacing: { after: 120 }, children: [new docx.TextRun({ text: title, bold: true, size: 34, color: "135B44", rightToLeft: true })] }),
    new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, bidirectional: true, spacing: { after: 280 }, children: [new docx.TextRun({ text: subtitle, size: 22, rightToLeft: true })] }),
  ];
  if (summary?.length) children.push(new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows: summary.map(([label, value]) => new docx.TableRow({ children: [value, label].map(text => new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, bidirectional: true, children: [new docx.TextRun({ text, bold: label === text, rightToLeft: true })] })] })) })) }));
  children.push(new docx.Paragraph({ spacing: { before: 240, after: 120 }, alignment: docx.AlignmentType.RIGHT, bidirectional: true, children: [new docx.TextRun({ text: "التفاصيل", bold: true, size: 26, rightToLeft: true })] }));
  children.push(new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    rows: [headers, ...rows].map((row, rowIndex) => new docx.TableRow({ children: [...row].reverse().map(value => new docx.TableCell({ shading: rowIndex === 0 ? { fill: "CFE9E0" } : undefined, children: [new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, bidirectional: true, children: [new docx.TextRun({ text: String(value), bold: rowIndex === 0, rightToLeft: true, size: 18 })] })] })) })),
  }));
  return new docx.Document({ sections: [{ properties: { page: { size: { orientation: docx.PageOrientation.LANDSCAPE }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }] });
}

export async function exportInvoicesWord(orders: ExportOrder[], context: ExportContext) {
  const docx = await import("docx");
  const generatedAt = context.generatedAt ?? new Date();
  const rows = orders.map(order => [order.barcode, context.branchNames.get(order.branchId) ?? `فرع #${order.branchId}`, order.customerName || "بدون اسم", order.deviceInfo, statusLabels[order.status] ?? order.status, `${(order.price / 100).toFixed(2)} ${context.currency}`, `${(order.amountPaid / 100).toFixed(2)} ${context.currency}`, `${(Math.max(0, order.price - order.amountPaid) / 100).toFixed(2)} ${context.currency}`, formatEstimatedSchedule(order.estimatedTime ?? 0, order.estimatedCompletionAt), formatWarrantySchedule(order)]);
  const document = await makeWordDocument("تقرير الفواتير", `${context.shopName} — ${context.scopeName} — ${dateLabel(generatedAt)}`, ["الفاتورة", "الفرع", "العميل", "الجهاز", "الحالة", "الإجمالي", "المدفوع", "المتبقي", "الإنجاز المتوقع", "الضمان وبدايته ونهايته"], rows);
  downloadBlob(await docx.Packer.toBlob(document), `invoices-${safeFilePart(context.scopeName)}-${generatedAt.toISOString().slice(0, 10)}.docx`);
}

export async function exportFinancialWord(orders: ExportOrder[], report: ExportFinancialReport, context: ExportContext) {
  const docx = await import("docx");
  const generatedAt = context.generatedAt ?? new Date();
  const money = (value: number) => `${(value / 100).toFixed(2)} ${context.currency}`;
  const summary: Array<[string, string]> = [["مبيعات اليوم", money(report.todayRevenue)], ["تكلفة اليوم", money(report.todayCost)], ["ربح اليوم", money(report.todayProfit)], ["مبيعات الشهر", money(report.revenue)], ["تكلفة الشهر", money(report.cost)], ["ربح الشهر", money(report.profit)], ["المبالغ المتبقية", money(report.unpaid)], ["متوسط الفاتورة", money(report.averageInvoiceValue)]];
  const rows = orders.map(order => [order.barcode, context.branchNames.get(order.branchId) ?? `فرع #${order.branchId}`, order.customerName || "بدون اسم", order.deviceInfo, money(order.price), money(order.cost), money(order.price - order.cost), money(order.amountPaid), money(Math.max(0, order.price - order.amountPaid))]);
  const document = await makeWordDocument("تقرير الأسعار والتكاليف والأرباح", `${context.shopName} — ${context.scopeName} — ${dateLabel(generatedAt)}`, ["الفاتورة", "الفرع", "العميل", "الجهاز", "السعر", "التكلفة", "الربح", "المدفوع", "المتبقي"], rows, summary);
  downloadBlob(await docx.Packer.toBlob(document), `financial-report-${safeFilePart(context.scopeName)}-${generatedAt.toISOString().slice(0, 10)}.docx`);
}
