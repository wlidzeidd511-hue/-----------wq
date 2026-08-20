import { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, FileText, Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  exportFinancialExcel,
  exportFinancialWord,
  exportInvoicesExcel,
  exportInvoicesWord,
  type ExportFinancialReport,
  type ExportOrder,
} from "@/lib/exportReports";

type Branch = { id: number; name: string };

export function ExportReportsPanel({ orders, financialReport, branches, selectedBranchId, shopName, currency, onUnlockFinancials }: {
  orders: ExportOrder[];
  financialReport: ExportFinancialReport | null;
  branches: Branch[];
  selectedBranchId?: number;
  shopName: string;
  currency: string;
  onUnlockFinancials: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const context = useMemo(() => ({
    shopName,
    scopeName: selectedBranchId ? branches.find(branch => branch.id === selectedBranchId)?.name ?? `فرع #${selectedBranchId}` : "جميع الفروع",
    currency,
    branchNames: new Map(branches.map(branch => [branch.id, branch.name])),
  }), [branches, currency, selectedBranchId, shopName]);
  async function run(key: string, action: () => Promise<void>) {
    try { setBusy(key); await action(); toast.success("تم تجهيز الملف وتنزيله"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر إنشاء الملف"); }
    finally { setBusy(null); }
  }
  return <Card className="mb-6 border border-sky-200 bg-white/94 p-5 shadow-lg shadow-sky-900/5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="flex items-center gap-2 text-sky-700"><FileDown className="h-5 w-5" /><span className="text-xs font-black">تنزيل وحفظ خارجي</span></div><h2 className="mt-1 text-xl font-black text-slate-950">تصدير الفواتير والتقرير المالي</h2><p className="mt-1 text-sm text-slate-500">يشمل الطلبات المطابقة للفلاتر الحالية والفرع المختار. بيانات التكلفة والربح لا تُصدّر إلا بعد فتح المالية.</p></div><div className="grid gap-2 sm:grid-cols-2 xl:min-w-[560px] xl:grid-cols-4"><Button variant="outline" onClick={() => run("invoices-excel", () => exportInvoicesExcel(orders, context))} disabled={Boolean(busy) || orders.length === 0} className="bg-white"><FileSpreadsheet className="h-4 w-4 text-emerald-700" />{busy === "invoices-excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : "فواتير Excel"}</Button><Button variant="outline" onClick={() => run("invoices-word", () => exportInvoicesWord(orders, context))} disabled={Boolean(busy) || orders.length === 0} className="bg-white"><FileText className="h-4 w-4 text-blue-700" />{busy === "invoices-word" ? <Loader2 className="h-4 w-4 animate-spin" /> : "فواتير Word"}</Button>{financialReport ? <><Button variant="outline" onClick={() => run("financial-excel", () => exportFinancialExcel(orders, financialReport, context))} disabled={Boolean(busy) || orders.length === 0} className="border-violet-200 bg-violet-50 text-violet-900"><FileSpreadsheet className="h-4 w-4" />{busy === "financial-excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : "مالية Excel"}</Button><Button variant="outline" onClick={() => run("financial-word", () => exportFinancialWord(orders, financialReport, context))} disabled={Boolean(busy) || orders.length === 0} className="border-violet-200 bg-violet-50 text-violet-900"><FileText className="h-4 w-4" />{busy === "financial-word" ? <Loader2 className="h-4 w-4 animate-spin" /> : "مالية Word"}</Button></> : <Button variant="outline" onClick={onUnlockFinancials} className="border-violet-200 bg-violet-50 text-violet-900 sm:col-span-2"><LockKeyhole className="h-4 w-4" />افتح المالية لتصدير التكلفة والربح</Button>}</div></div></Card>;
}
