import { useEffect, useState } from "react";
import { Clock3, Loader2, Radio, Send, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type Audience = "customer" | "visitor" | "branch_online" | "all_online";
type Branch = { id: number; name: string };
type SelectedRecipient = {
  sessionKey: string;
  orderBarcode: string | null;
  deviceInfo: string | null;
  serviceType: "maintenance" | "programming" | null;
  customerName: string | null;
  customerPhone: string | null;
  branchName: string | null;
  displayLabel: string | null;
  invoices: Array<{
    id: number;
    barcode: string;
    deviceInfo: string;
    serviceType: "maintenance" | "programming";
    status: string;
    customerName: string | null;
    customerPhone: string | null;
    branchName: string | null;
    createdAt: Date;
  }>;
};

const pageNames: Record<string, string> = {
  "/": "الرئيسية",
  "/track": "تتبع الطلب",
  "/invoice": "الفاتورة",
  "/account": "حساب العميل",
  "/contact": "اتصل بنا",
};

const categoryLabels: Record<string, string> = {
  in_repair: "أثناء الصيانة",
  ready: "صار جاهز",
  before_rating: "قبل التقييم",
  after_delivery: "بعد التسليم",
  before_scratch: "قبل الكشط",
  scratch_win: "فاز بالكشط",
  scratch_loss: "خسر بالكشط",
};

const statusLabels: Record<string, string> = {
  pending: "تم الاستلام",
  diagnosing: "قيد الفحص",
  awaiting_approval: "بانتظار الموافقة",
  in_progress: "جاري العمل",
  ready: "جاهز للاستلام",
};

function invoiceDate(value: Date) {
  return new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium" }).format(new Date(value));
}

function pageLabel(path: string) {
  const base = path.split("?")[0];
  return pageNames[base] || base;
}

function riyadhDateTime(value: number) {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function OwnerEngagementPanel({ selectedBranchId, branches }: { selectedBranchId?: number; branches: Branch[] }) {
  const utils = trpc.useUtils();
  const online = trpc.engagement.online.useQuery(
    selectedBranchId ? { branchId: selectedBranchId } : undefined,
    { retry: false, refetchInterval: 15_000 },
  );
  const library = trpc.platform.popups.list.useQuery({ includeInactive: false }, { retry: false });
  const [sentOpen, setSentOpen] = useState(false);
  const sent = trpc.engagement.sent.useQuery(selectedBranchId ? { branchId: selectedBranchId, limit: 30 } : { limit: 30 }, { retry: false, enabled: sentOpen });
  const [audience, setAudience] = useState<Audience>("visitor");
  const [branchId, setBranchId] = useState(selectedBranchId ? String(selectedBranchId) : "");
  const [customerId, setCustomerId] = useState("");
  const [targetSessionKey, setTargetSessionKey] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<SelectedRecipient | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedLibraryMessage, setSelectedLibraryMessage] = useState("custom");
  const finishSend = async () => {
    toast.success("تم إرسال الرسالة وستظهر للفاتورة المحددة فقط");
    setTitle("");
    setBody("");
    setCustomerId("");
    setTargetSessionKey("");
    setSelectedRecipient(null);
    setSelectedOrderId("");
    await utils.engagement.online.invalidate();
    await utils.engagement.sent.invalidate();
  };
  const send = trpc.engagement.send.useMutation({
    onSuccess: finishSend,
    onError: error => toast.error(error.message),
  });
  const sendToOrder = trpc.engagement.sendToOrder.useMutation({
    onSuccess: finishSend,
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (selectedBranchId) {
      setBranchId(String(selectedBranchId));
    } else if (audience === "branch_online") {
      setAudience("all_online");
      setBranchId("");
    }
  }, [selectedBranchId]);

  const handleSend = () => {
    if (audience === "visitor" && !targetSessionKey) return toast.error("اختر الزبون برقم الفاتورة والجهاز أولًا");
    if (!body.trim()) return toast.error("اكتب نص الرسالة");
    if (audience === "visitor" && selectedRecipient?.invoices.length) {
      if (!selectedOrderId) return toast.error("اختر رقم الفاتورة التي تخصها الرسالة");
      const invoice = selectedRecipient.invoices.find(item => item.id === Number(selectedOrderId));
      if (!invoice) return toast.error("الفاتورة المختارة غير متاحة");
      sendToOrder.mutate({
        orderId: invoice.id,
        title: title.trim() || `تحديث بخصوص فاتورة #${invoice.barcode}`,
        body: body.trim(),
        expiresInMinutes: 120,
      });
      return;
    }
    send.mutate({
      audience,
      branchId: branchId ? Number(branchId) : null,
      customerId: customerId ? Number(customerId) : null,
      targetSessionKey: targetSessionKey || null,
      title: title.trim() || null,
      body: body.trim(),
      expiresInMinutes: 120,
    });
  };

  const selectVisitor = (visitor: (typeof visitors)[number]) => {
    setAudience("visitor");
    setTargetSessionKey(visitor.sessionKey);
    setCustomerId(visitor.customerId ? String(visitor.customerId) : "");
    if (visitor.branchId) setBranchId(String(visitor.branchId));
    setSelectedRecipient(visitor);
    setSelectedOrderId(visitor.invoices.length === 1 ? String(visitor.invoices[0].id) : "");
    toast.info(visitor.invoices.length ? `تم اختيار ${visitor.invoices.length === 1 ? `فاتورة #${visitor.invoices[0].barcode}` : `${visitor.invoices.length} فواتير للعميل`}` : "تم اختيار زبون عام غير مرتبط بفاتورة");
  };

  const visitors = online.data ?? [];
  const libraryMessages = (library.data ?? []).filter(message => message.branchId === null || !selectedBranchId || message.branchId === selectedBranchId);
  return <section className="mb-6 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
    <Card className="border border-white/80 bg-white/94 p-5 shadow-xl shadow-sky-900/5 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-emerald-600"><Radio className="h-4 w-4 animate-pulse" /><span className="text-xs font-black">مباشر الآن</span></div><h2 className="mt-1 text-xl font-black text-slate-950">العملاء داخل الموقع</h2></div><span className="flex h-14 min-w-14 items-center justify-center rounded-2xl bg-emerald-50 px-4 text-2xl font-black text-emerald-700">{visitors.length}</span></div>
      <div className="mt-5 max-h-72 space-y-2 overflow-y-auto pl-1">
        {online.isLoading ? <div className="py-10 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-sky-500" /></div> : visitors.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center"><UsersRound className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">لا يوجد زوار نشطون خلال آخر 90 ثانية</p></div> : visitors.map(visitor => <button key={visitor.id} type="button" onClick={() => selectVisitor(visitor)} className={`w-full rounded-2xl border p-3 text-right transition ${targetSessionKey === visitor.sessionKey ? "border-sky-400 bg-sky-50 ring-2 ring-sky-100" : "border-slate-100 bg-slate-50/70 hover:border-sky-200 hover:bg-sky-50"}`}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm"><UserRound className="h-5 w-5" /></span><div className="min-w-0">{visitor.invoices.length ? <><p className="truncate text-sm font-black text-sky-900">{visitor.invoices[0].customerName || visitor.displayLabel || "عميل معروف"}</p><p className="mt-1 text-[11px] font-bold text-slate-500">{visitor.invoices.length} {visitor.invoices.length === 1 ? "فاتورة نشطة غير مسلّمة" : "فواتير نشطة غير مسلّمة"}</p></> : <><p className="text-sm font-black text-slate-900">زبون عام</p><p className="mt-1 truncate text-xs text-slate-500">لا توجد فاتورة نشطة غير مسلّمة · {pageLabel(visitor.currentPath)}</p></>}</div></div><div className="shrink-0 text-left"><Badge className="bg-emerald-50 text-emerald-700">متصل</Badge><p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><Clock3 className="h-3 w-3" />آخر زيارة: {riyadhDateTime(visitor.lastSeenAt)}</p></div></div>{visitor.invoices.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{visitor.invoices.map(invoice => <div key={invoice.id} className="rounded-xl border border-sky-100 bg-white p-3"><p className="text-xs font-black text-sky-800">فاتورة #{invoice.barcode} · {invoice.branchName || "الفرع غير محدد"}</p><p className="mt-1 truncate text-xs font-bold text-slate-700">{invoice.deviceInfo}</p><p className="mt-1 text-[10px] text-slate-500">{statusLabels[invoice.status] || invoice.status} · {invoiceDate(invoice.createdAt)}</p><p className="mt-1 text-[10px] text-slate-500">{invoice.serviceType === "maintenance" ? "صيانة" : "برمجة"} · {invoice.customerPhone ? `آخر الجوال ${invoice.customerPhone.slice(-4)}` : "بدون جوال"}</p></div>)}</div>}</button>)}
      </div>
    </Card>
    <Card className="border border-white/80 bg-white/94 p-5 shadow-xl shadow-sky-900/5 backdrop-blur-xl">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600"><Send className="h-5 w-5" /></span><div><h2 className="text-xl font-black text-slate-950">إرسال رسالة مباشرة</h2><p className="text-xs text-slate-500">تظهر في منتصف شاشة العميل حتى يغلقها</p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Select value={audience} onValueChange={value => setAudience(value as Audience)}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="visitor">زبون محدد بالفاتورة والجهاز</SelectItem><SelectItem value="branch_online">جميع الموجودين في فرع</SelectItem><SelectItem value="all_online">جميع الموجودين الآن</SelectItem></SelectContent></Select>
        {audience === "branch_online" ? <Select value={branchId} onValueChange={setBranchId}><SelectTrigger className="bg-white"><SelectValue placeholder="اختر الفرع" /></SelectTrigger><SelectContent>{branches.map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select> : audience === "visitor" ? <Select value={targetSessionKey} onValueChange={value => { const visitor = visitors.find(item => item.sessionKey === value); if (visitor) selectVisitor(visitor); }}><SelectTrigger className="bg-white"><SelectValue placeholder="اختر العميل وفاتورته النشطة" /></SelectTrigger><SelectContent>{visitors.map(visitor => <SelectItem key={visitor.sessionKey} value={visitor.sessionKey}>{visitor.invoices.length ? `${visitor.invoices[0].customerName || "عميل"} — ${visitor.invoices.length} ${visitor.invoices.length === 1 ? "فاتورة نشطة" : "فواتير نشطة"}` : `زبون عام — بلا فاتورة نشطة`}</SelectItem>)}</SelectContent></Select> : <div className="flex items-center rounded-xl bg-slate-50 px-3 text-xs font-bold text-slate-500">كل الزوار المتصلين</div>}
        {audience === "visitor" && selectedRecipient && <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:col-span-2"><p className="text-xs font-black text-sky-700">المستلم المحدد قبل الإرسال</p>{selectedRecipient.invoices.length ? <><p className="mt-2 text-lg font-black text-slate-950">{selectedRecipient.invoices[0].customerName || selectedRecipient.displayLabel || "عميل معروف"}</p><p className="mt-1 text-xs font-bold text-slate-600">تظهر هنا الفواتير النشطة غير المسلّمة فقط. اختر واحدة؛ الرسالة لن تظهر في بقية فواتير العميل.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{selectedRecipient.invoices.map(invoice => <button type="button" key={invoice.id} onClick={() => { setSelectedOrderId(String(invoice.id)); setTitle(current => current.trim() ? current : `تحديث بخصوص فاتورة #${invoice.barcode}`); }} className={`rounded-xl border p-3 text-right transition ${selectedOrderId === String(invoice.id) ? "border-sky-500 bg-sky-100 ring-2 ring-sky-200" : "border-sky-100 bg-white hover:border-sky-300"}`}><p className="font-black text-sky-800">فاتورة #{invoice.barcode}</p><p className="mt-1 text-xs font-bold text-slate-700">{invoice.deviceInfo} · {invoice.branchName || "الفرع غير محدد"}</p><p className="mt-1 text-[11px] font-bold text-slate-500">{statusLabels[invoice.status] || invoice.status} · {invoiceDate(invoice.createdAt)}</p></button>)}</div></> : <p className="mt-2 font-black text-slate-800">لا توجد لهذا الزائر فاتورة نشطة غير مسلّمة — {selectedRecipient.displayLabel || "زبون عام"}</p>}</div>}
        <div className="sm:col-span-2"><p className="mb-2 text-xs font-black text-slate-600">اختر رسالة من مكتبة الرسائل العشوائية أو اكتب رسالة خاصة</p><Select value={selectedLibraryMessage} onValueChange={value => { setSelectedLibraryMessage(value); if (value === "custom") return; const message = libraryMessages.find(item => String(item.id) === value); if (message) { setBody(message.message); setTitle(categoryLabels[message.category] || "رسالة من هاتف التميز"); } }}><SelectTrigger className="bg-white"><SelectValue placeholder="اختر رسالة جاهزة" /></SelectTrigger><SelectContent><SelectItem value="custom">كتابة رسالة خاصة</SelectItem>{libraryMessages.map(message => <SelectItem key={message.id} value={String(message.id)}>{categoryLabels[message.category]} — {message.message}</SelectItem>)}</SelectContent></Select></div>
        <Input value={title} onChange={event => setTitle(event.target.value)} placeholder="عنوان مختصر (اختياري)" className="bg-white sm:col-span-2" />
        <Textarea value={body} onChange={event => setBody(event.target.value)} rows={4} placeholder="اكتب الرسالة التي تريد أن تظهر للعميل..." className="bg-white sm:col-span-2" />
      </div>
      <Button type="button" onClick={handleSend} disabled={send.isPending || sendToOrder.isPending} className="mt-4 w-full bg-sky-500 font-bold text-white hover:bg-sky-600">{send.isPending || sendToOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}إرسال الآن</Button>
    </Card>
    <details open={sentOpen} onToggle={event => setSentOpen(event.currentTarget.open)} className="rounded-2xl border border-white/80 bg-white/94 p-5 shadow-xl shadow-sky-900/5 backdrop-blur-xl xl:col-span-2">
      <summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black text-sky-600">سجل واضح للمستلمين</p><h2 className="mt-1 text-xl font-black text-slate-950">آخر الرسائل المرسلة</h2><p className="mt-1 text-sm text-slate-500">اضغط لعرض أو إخفاء الفاتورة والجهاز والزبون الذي استلم كل رسالة.</p></div><span className="rounded-full bg-sky-50 px-3 py-2 text-xs font-black text-sky-700">{sentOpen ? "إخفاء السجل" : "فتح السجل"}</span></div></summary>
      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 lg:grid-cols-2">{sent.isLoading ? <div className="py-8 text-center lg:col-span-2"><Loader2 className="mx-auto h-7 w-7 animate-spin text-sky-500" /></div> : sent.data?.length ? sent.data.map(message => <article key={message.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div>{message.orderBarcode ? <><p className="font-black text-sky-800">أُرسلت إلى فاتورة #{message.orderBarcode}</p><p className="mt-1 text-sm font-bold text-slate-700">{message.customerName || "بدون اسم"} — {message.deviceInfo || "الجهاز غير محدد"} — {message.branchName || "الفرع غير محدد"}</p></> : <p className="font-black text-slate-700">{message.audience === "all_online" ? "أُرسلت لجميع الموجودين" : message.audience === "branch_online" ? `أُرسلت لموجودي ${message.branchName || "الفرع"}` : "أُرسلت لزبون عام غير مرتبط بفاتورة"}</p>}</div><time className="shrink-0 text-[11px] text-slate-400">{riyadhDateTime(message.createdAt)}</time></div><p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{message.body}</p></article>) : <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-500 lg:col-span-2">لم تُرسل رسائل مباشرة بعد.</div>}</div>
    </details>
  </section>;
}
