import { useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const statusLabels: Record<string, string> = {
  pending: "تم الاستلام",
  diagnosing: "قيد الفحص",
  awaiting_approval: "بانتظار الموافقة",
  in_progress: "جاري العمل",
  ready: "جاهز للاستلام",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

export function OrderDirectMessageComposer({ orderId, barcode, customerName, customerPhone, customerId }: {
  orderId: number;
  barcode: string;
  customerName: string | null;
  customerPhone: string | null;
  customerId: number | null;
}) {
  const utils = trpc.useUtils();
  const invoiceQueryInput = useMemo(() => ({ customerId: customerId ?? 1 }), [customerId]);
  const invoicesQuery = trpc.engagement.customerInvoices.useQuery(invoiceQueryInput, {
    enabled: Boolean(customerId),
    retry: false,
  });
  const [selectedOrderId, setSelectedOrderId] = useState(orderId);
  const [title, setTitle] = useState(`تحديث بخصوص فاتورة #${barcode}`);
  const [body, setBody] = useState("");
  const send = trpc.engagement.sendToOrder.useMutation();

  useEffect(() => {
    setSelectedOrderId(orderId);
    setTitle(`تحديث بخصوص فاتورة #${barcode}`);
    setBody("");
  }, [barcode, orderId]);

  const invoices = invoicesQuery.data ?? [];
  const selectedInvoice = invoices.find(invoice => invoice.id === selectedOrderId);
  const selectedBarcode = selectedInvoice?.barcode ?? barcode;

  function selectInvoice(value: string) {
    const nextOrderId = Number(value);
    const invoice = invoices.find(item => item.id === nextOrderId);
    setSelectedOrderId(nextOrderId);
    if (invoice) setTitle(`تحديث بخصوص فاتورة #${invoice.barcode}`);
  }

  async function handleSend() {
    if (!selectedOrderId) return toast.error("اختر الفاتورة التي تخصها الرسالة");
    if (!body.trim()) return toast.error("اكتب الرسالة أولًا");
    try {
      await send.mutateAsync({
        orderId: selectedOrderId,
        title: title.trim() || `تحديث بخصوص فاتورة #${selectedBarcode}`,
        body: body.trim(),
        expiresInMinutes: 1440,
      });
      setBody("");
      await utils.engagement.sent.invalidate();
      toast.success(`تم إرسال الرسالة إلى فاتورة #${selectedBarcode} فقط`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال الرسالة");
    }
  }

  return (
    <Card className="mt-5 border-sky-200 bg-sky-50/70 p-5" aria-label="إرسال رسالة داخل الموقع">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-sky-700">رسالة فورية داخل الموقع</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{customerName || "الزبون"}</h3>
          <p className="mt-1 text-xs text-slate-500" dir="ltr">{customerPhone || "لا يوجد رقم جوال"}</p>
        </div>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">تظهر دون تحديث</span>
      </div>
      {customerId ? (
        <div className="mt-4 space-y-3">
          <label className="block space-y-2">
            <span className="text-sm font-black text-slate-800">اختر فاتورة العميل التي تخصها الرسالة</span>
            <Select value={String(selectedOrderId)} onValueChange={selectInvoice} disabled={invoicesQuery.isLoading || invoices.length === 0}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="اختر الفاتورة" /></SelectTrigger>
              <SelectContent>
                {invoices.map(invoice => (
                  <SelectItem key={invoice.id} value={String(invoice.id)}>
                    فاتورة #{invoice.barcode} · {invoice.deviceInfo} · {statusLabels[invoice.status] ?? invoice.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <p className="rounded-xl border border-sky-200 bg-white p-3 text-xs font-bold leading-6 text-sky-900">الرسالة سترتبط بفاتورة #{selectedBarcode} فقط، ولن تظهر تلقائيًا في بقية فواتير العميل.</p>
          <Input value={title} onChange={event => setTitle(event.target.value)} maxLength={255} placeholder="عنوان الرسالة" className="bg-white" />
          <Textarea value={body} onChange={event => setBody(event.target.value)} maxLength={4000} placeholder="اكتب رسالتك للزبون..." className="min-h-28 bg-white" />
          <Button onClick={handleSend} disabled={send.isPending || invoicesQuery.isLoading || !body.trim() || !selectedOrderId} className="w-full bg-sky-500 font-bold text-white hover:bg-sky-600">
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            إرسال لفاتورة #{selectedBarcode}
          </Button>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">لا يوجد حساب عميل مرتبط بهذه الفاتورة. افتح بيانات العميل واحفظ رقم جواله أولًا.</p>
      )}
    </Card>
  );
}
