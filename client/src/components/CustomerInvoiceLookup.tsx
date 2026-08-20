import { useEffect, useState } from "react";
import { CalendarClock, FileText, Loader2, MessageSquareText, Search, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatWarrantyYears } from "@/lib/serviceUnits";

const statusLabels: Record<string, string> = {
  pending: "تم الاستلام",
  diagnosing: "قيد الفحص",
  awaiting_approval: "بانتظار الموافقة",
  in_progress: "جاري العمل",
  ready: "جاهز للاستلام",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

function formatMoney(value: number) {
  return `${(value / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

function formatDate(value: Date | number | null | undefined) {
  if (!value) return "غير محدد";
  return new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

type CustomerInvoiceLookupProps = {
  phone?: string;
  compact?: boolean;
};

export function CustomerInvoiceLookup({ phone, compact = false }: CustomerInvoiceLookupProps) {
  const [phoneInput, setPhoneInput] = useState(phone ?? "");
  const [searchPhone, setSearchPhone] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [message, setMessage] = useState({ title: "تحديث على فاتورتك", body: "" });

  useEffect(() => {
    if (phone === undefined) return;
    setPhoneInput(phone);
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      setSearchPhone("");
      return;
    }
    const timer = window.setTimeout(() => setSearchPhone(phone.trim()), 450);
    return () => window.clearTimeout(timer);
  }, [phone]);

  const searchQuery = trpc.accounts.customer.ownerSearchByPhone.useQuery(
    { phone: searchPhone },
    { enabled: searchPhone.replace(/\D/g, "").length >= 9, retry: false },
  );
  const sendMutation = trpc.engagement.sendToOrder.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال الـPopup لهذه الفاتورة فقط");
      setMessage({ title: "تحديث على فاتورتك", body: "" });
      setSelectedOrderId(null);
    },
    onError: error => toast.error(error.message || "تعذر إرسال الرسالة"),
  });

  function submitSearch() {
    if (phoneInput.replace(/\D/g, "").length < 9) return toast.error("أدخل رقم جوال صحيحًا");
    setSelectedOrderId(null);
    setSearchPhone(phoneInput.trim());
  }

  async function sendPopup() {
    if (!selectedOrderId) return toast.error("اختر فاتورة غير مسلّمة أولًا");
    if (!message.body.trim()) return toast.error("اكتب نص الرسالة");
    await sendMutation.mutateAsync({
      orderId: selectedOrderId,
      title: message.title.trim() || "تحديث على فاتورتك",
      body: message.body.trim(),
      expiresInMinutes: 1440,
    });
  }

  const result = searchQuery.data;
  const selectedOrder = result?.undeliveredOrders.find(order => order.id === selectedOrderId);

  return (
    <Card className={`border border-sky-100 bg-white/95 shadow-lg shadow-sky-900/5 ${compact ? "p-4" : "mb-6 p-5 sm:p-6"}`} dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-2">
          <span className="text-sm font-black text-slate-800">ابحث عن عميل برقم الجوال</span>
          <div className="relative"><Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><Input value={phoneInput} onChange={event => setPhoneInput(event.target.value)} onKeyDown={event => event.key === "Enter" && submitSearch()} inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" className="h-11 bg-white pr-11 text-right" /></div>
        </label>
        {phone === undefined && <Button onClick={submitSearch} disabled={searchQuery.isFetching} className="h-11 bg-sky-500 font-bold text-white hover:bg-sky-600">{searchQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}بحث وعرض الفواتير</Button>}
      </div>

      {searchQuery.isFetching && <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-sky-50 p-5 text-sm font-bold text-sky-700"><Loader2 className="h-5 w-5 animate-spin" />جاري البحث عن العميل وفواتيره...</div>}

      {searchPhone && !searchQuery.isFetching && result && !result.customer && (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">لا يوجد عميل أو فاتورة مرتبطة بهذا الرقم داخل الفرع المفتوح.</div>
      )}

      {result?.customer && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-l from-sky-500 to-cyan-400 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-bold text-sky-100">حساب العميل</p><h3 className="mt-1 text-xl font-black">{result.customer.name || "عميل هاتف التميز"}</h3><p className="mt-1 text-sm font-bold" dir="ltr">{result.customer.phoneDisplay}</p></div>
            <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white/15 px-3 py-2"><strong className="block text-xl">{result.totals.all}</strong><span className="text-[11px]">كل الفواتير</span></div><div className="rounded-xl bg-white/15 px-3 py-2"><strong className="block text-xl">{result.totals.undelivered}</strong><span className="text-[11px]">غير مسلّمة</span></div><div className="rounded-xl bg-white/15 px-3 py-2"><strong className="block text-xl">{result.totals.activeWarranties}</strong><span className="text-[11px]">ضمان نشط</span></div></div>
          </div>

          {selectedOrder && (
            <div className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-4">
              <div className="flex items-start gap-3"><MessageSquareText className="mt-1 h-5 w-5 shrink-0 text-violet-700" /><div><h4 className="font-black text-violet-950">إرسال Popup لفاتورة #{selectedOrder.barcode} فقط</h4><p className="mt-1 text-xs text-violet-700">{selectedOrder.deviceInfo} — لن تظهر الرسالة في أي فاتورة أخرى.</p></div></div>
              <div className="mt-4 grid gap-3"><Input value={message.title} onChange={event => setMessage({ ...message, title: event.target.value })} placeholder="عنوان الرسالة" className="bg-white" /><Textarea value={message.body} onChange={event => setMessage({ ...message, body: event.target.value })} placeholder="اكتب الرسالة التي ستظهر للعميل..." className="min-h-24 bg-white" /><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setSelectedOrderId(null)} className="bg-white">إلغاء الاختيار</Button><Button onClick={sendPopup} disabled={sendMutation.isPending} className="bg-violet-600 font-bold text-white hover:bg-violet-700">{sendMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}إرسال لهذه الفاتورة فقط</Button></div></div>
            </div>
          )}

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-black text-slate-950">الفواتير والأجهزة والضمانات</h4><p className="text-xs text-slate-500">النتائج تخص الفرع المفتوح فقط.</p></div>{result.totals.undelivered > 0 && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">{result.totals.undelivered} فاتورة لم تُسلّم</Badge>}</div>
            <div className="grid gap-3 lg:grid-cols-2">
              {result.orders.map(order => (
                <article key={order.id} className={`rounded-2xl border p-4 ${selectedOrderId === order.id ? "border-violet-400 bg-violet-50" : order.isUndelivered ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-sky-700">فاتورة #{order.barcode}</p><h5 className="mt-1 font-black text-slate-950">{order.deviceInfo}</h5><p className="mt-1 text-xs text-slate-500">{formatDate(order.createdAt)}</p></div><Badge variant={order.status === "delivered" ? "secondary" : "default"}>{statusLabels[order.status] ?? order.status}</Badge></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-3"><Smartphone className="mb-1 h-4 w-4 text-sky-600" /><span className="text-slate-500">الخدمة</span><strong className="mt-1 block">{order.serviceType === "maintenance" ? "صيانة" : "برمجة"}</strong></div><div className="rounded-xl bg-slate-50 p-3"><FileText className="mb-1 h-4 w-4 text-emerald-600" /><span className="text-slate-500">الإجمالي</span><strong className="mt-1 block">{formatMoney(order.price)}</strong></div><div className="col-span-2 rounded-xl bg-slate-50 p-3"><ShieldCheck className="mb-1 h-4 w-4 text-violet-600" /><span className="text-slate-500">الضمان</span><strong className="mt-1 block">{order.warrantyState === "active" ? `${formatWarrantyYears(order.warrantyDays)} · نشط حتى ${formatDate(order.warrantyExpiresAt)}` : order.warrantyState === "expired" ? `${formatWarrantyYears(order.warrantyDays)} · منتهٍ منذ ${formatDate(order.warrantyExpiresAt)}` : order.warrantyState === "not_started" ? `${formatWarrantyYears(order.warrantyDays)} تبدأ بعد التسليم` : formatWarrantyYears(order.warrantyDays)}</strong></div></div>
                  <div className="mt-3 flex flex-wrap gap-2"><a href={`/invoice?t=${order.publicToken}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"><FileText className="h-4 w-4" />فتح الفاتورة</a>{order.isUndelivered && !order.archived && <Button size="sm" onClick={() => setSelectedOrderId(order.id)} className="min-h-10 bg-violet-600 font-bold text-white hover:bg-violet-700"><MessageSquareText className="h-4 w-4" />اختيار لإرسال Popup</Button>}{order.status === "delivered" && order.deliveredAt && <span className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-800"><CalendarClock className="h-4 w-4" />سُلّمت {formatDate(order.deliveredAt)}</span>}</div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
