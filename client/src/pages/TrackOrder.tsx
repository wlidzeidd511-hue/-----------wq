import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Headphones,
  Loader2,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  Smartphone,
  Wrench,
  X,
} from "lucide-react";
import { ServiceBackdrop } from "@/components/ServiceBackdrop";
import { PublicAdditionalRepairProposals } from "@/components/AdditionalRepairCustomerCards";
import { PublicPostDeliveryRating } from "@/components/PostDeliveryRating";
import { OrderStatusPopup } from "@/components/OrderStatusPopup";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { formatEstimatedSchedule, formatWarrantySchedule } from "@/lib/serviceDates";
import { buildWhatsAppUrl, STORE_APP_ICON_URL } from "@shared/siteConfig";
import { toast } from "sonner";

const statusConfig = {
  pending: { label: "تم الاستلام", description: "تم تسجيل الطلب واستلام الجهاز.", color: "amber", icon: PackageCheck },
  diagnosing: { label: "قيد الفحص", description: "يتم فحص الجهاز وتحديد العمل المطلوب.", color: "violet", icon: Search },
  awaiting_approval: { label: "بانتظار الموافقة", description: "بانتظار موافقتك على السعر قبل بدء العمل.", color: "orange", icon: Clock3 },
  in_progress: { label: "جاري العمل", description: "الفني يعمل على الجهاز حاليًا.", color: "sky", icon: Wrench },
  ready: { label: "جاهز للاستلام", description: "جهازك جاهز، نسعد باستلامك له.", color: "emerald", icon: CheckCircle2 },
  delivered: { label: "تم التسليم", description: "تم تسليم الجهاز وإغلاق الطلب.", color: "slate", icon: ShieldCheck },
  cancelled: { label: "ملغي", description: "تم إلغاء الطلب.", color: "red", icon: X },
} as const;

const statusClasses: Record<string, string> = {
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
  orange: "bg-orange-50 text-orange-800 ring-orange-200",
  sky: "bg-sky-50 text-sky-800 ring-sky-200",
  emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  slate: "bg-slate-100 text-slate-800 ring-slate-200",
  red: "bg-red-50 text-red-800 ring-red-200",
};

function formatMoney(value: number, currency = "ر.س") {
  return `${(value / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(value: Date | number | null | undefined) {
  if (!value) return "غير محدد";
  return new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

export default function TrackOrder() {
  const initialToken = useMemo(() => new URLSearchParams(window.location.search).get("t") ?? "", []);
  const [barcode, setBarcode] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [queryInput, setQueryInput] = useState<
    { token: string } | { barcode: string; phoneLast4: string; branchId: number } | null
  >(initialToken ? { token: initialToken } : null);
  const utils = trpc.useUtils();
  const settingsQuery = trpc.settings.public.useQuery();
  const branchesQuery = trpc.platform.branches.publicList.useQuery(undefined, { retry: false });
  const orderQuery = trpc.orders.track.useQuery(queryInput!, {
    enabled: Boolean(queryInput),
    retry: false,
    refetchInterval: queryInput ? 5_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const approvalMutation = trpc.orders.respondApproval.useMutation();

  useEffect(() => {
    if (orderQuery.error) toast.error("لم نعثر على الطلب بهذه البيانات");
  }, [orderQuery.error]);

  useEffect(() => {
    if (!selectedBranch && branchesQuery.data?.[0]) setSelectedBranch(String(branchesQuery.data[0].id));
  }, [branchesQuery.data, selectedBranch]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !queryInput) return;
    const refresh = () => void orderQuery.refetch();
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "HATTEF_PUSH_REFRESH") refresh();
    };
    const handleVisibility = () => document.visibilityState === "visible" && refresh();
    navigator.serviceWorker.addEventListener("message", handleMessage);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [orderQuery.refetch, queryInput]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!barcode.trim()) return toast.error("أدخل رقم الطلب");
    if (phoneLast4.length !== 4) return toast.error("أدخل آخر أربعة أرقام من جوالك");
    if (!selectedBranch) return toast.error("اختر الفرع");
    setQueryInput({ barcode: barcode.trim(), phoneLast4, branchId: Number(selectedBranch) });
  };

  const handleApproval = async (decision: "approved" | "rejected") => {
    const token = orderQuery.data?.order.publicToken;
    if (!token) return;
    try {
      await approvalMutation.mutateAsync({ token, decision });
      toast.success(decision === "approved" ? "تمت الموافقة على السعر" : "تم رفض السعر وإبلاغ المحل");
      await utils.orders.track.invalidate({ token });
    } catch {
      toast.error("تعذر تسجيل القرار، حاول مرة أخرى");
    }
  };

  const bundle = orderQuery.data;
  const order = bundle?.order;
  const orderBranch = branchesQuery.data?.find(branch => branch.id === order?.branchId);
  const settings = {
    shopName: orderBranch?.settings?.displayName ?? settingsQuery.data?.shopName ?? "هاتف التميز",
    subtitle: orderBranch?.name ?? settingsQuery.data?.subtitle ?? "للاتصالات",
    currency: orderBranch?.settings?.currency ?? settingsQuery.data?.currency ?? "ر.س",
    openingHours: orderBranch?.settings?.openingHours ?? settingsQuery.data?.openingHours,
    phone: orderBranch?.settings?.phone ?? settingsQuery.data?.phone,
    mapUrl: orderBranch?.settings?.mapUrl ?? settingsQuery.data?.mapUrl,
  };
  const currentStatus = order ? statusConfig[order.status] : null;
  const StatusIcon = currentStatus?.icon ?? Clock3;
  const remaining = order ? Math.max(order.price - order.amountPaid, 0) : 0;

  useEffect(() => {
    const branchId = order?.branchId ?? Number(selectedBranch);
    if (branchId > 0) window.localStorage.setItem("hattef-current-branch-id", String(branchId));
    if (order?.publicToken) window.localStorage.setItem("hattef-current-order-token", order.publicToken);
  }, [order?.branchId, order?.publicToken, selectedBranch]);

  return (
    <div className="page-background min-h-screen" dir="rtl">
      {order && <OrderStatusPopup branchId={order.branchId} status={order.status} orderToken={order.publicToken} />}
      <ServiceBackdrop />
      <div className="page-content relative z-10">
        <header className="sticky top-0 z-40 border-b border-white/70 bg-white/90 shadow-sm backdrop-blur-xl">
          <div className="container flex h-20 items-center justify-between gap-3">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-0.5 shadow-lg shadow-sky-500/20 ring-1 ring-sky-100">
                <img src={STORE_APP_ICON_URL} alt="الشعار الرسمي لهاتف التميز" className="h-full w-full object-contain" />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-lg font-black text-slate-950">{settings?.shopName ?? "هاتف التميز"}</strong>
                <small className="block text-xs font-semibold text-sky-600">{settings?.subtitle ?? "للاتصالات"}</small>
              </span>
            </Link>
            <div className="flex items-center gap-1 sm:gap-2">
              {order && (
                <Link href={`/invoice?t=${order.publicToken}`} className="inline-flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700 hover:bg-sky-100">
                  <Printer className="h-4 w-4" /><span className="hidden sm:inline">الفاتورة</span>
                </Link>
              )}
              <Link href="/" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-sky-50 hover:text-sky-700">
                <ArrowRight className="h-4 w-4" /><span className="hidden sm:inline">الرئيسية</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="container py-8 sm:py-12">
          <section className="mx-auto mb-8 max-w-3xl text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-xl shadow-sky-500/25">
              <QrCode className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-black text-slate-950 sm:text-4xl">تتبّع طلبك لحظة بلحظة</h1>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-slate-600">امسح الباركود الموجود في الفاتورة، أو أدخل رقم الطلب وآخر أربعة أرقام من جوالك.</p>
          </section>

          {order?.publicToken && <div className="mx-auto mb-6 max-w-3xl"><PushNotificationToggle mode="tracking" token={order.publicToken} /></div>}

          {!initialToken && (
            <Card className="mx-auto mb-8 max-w-3xl border border-white/80 bg-white/90 p-5 shadow-xl shadow-sky-900/10 backdrop-blur-xl sm:p-7">
              <form onSubmit={handleSearch} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_0.8fr_0.8fr_auto] lg:items-end">
                <div>
                  <label htmlFor="order-number" className="mb-2 block text-sm font-bold text-slate-800">رقم الطلب</label>
                  <Input id="order-number" inputMode="numeric" value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="مثال: 25" className="h-12 border-sky-200 bg-white text-base" />
                </div>
                <div>
                  <label htmlFor="phone-last4" className="mb-2 block text-sm font-bold text-slate-800">آخر 4 أرقام من الجوال</label>
                  <Input id="phone-last4" inputMode="numeric" maxLength={4} value={phoneLast4} onChange={event => setPhoneLast4(event.target.value.replace(/\D/g, ""))} placeholder="1234" className="h-12 border-sky-200 bg-white text-base" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-800">الفرع</label>
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}><SelectTrigger className="h-12 border-sky-200 bg-white"><Building2 className="ml-2 h-4 w-4 text-sky-600" /><SelectValue placeholder="اختر الفرع" /></SelectTrigger><SelectContent>{branchesQuery.data?.filter(branch => branch.isActive).map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select>
                </div>
                <Button type="submit" disabled={orderQuery.isFetching} className="h-12 bg-sky-500 px-6 font-bold text-white hover:bg-sky-600">
                  {orderQuery.isFetching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />} بحث
                </Button>
              </form>
              <p className="mt-4 text-center text-xs text-slate-500">عندك أكثر من فاتورة؟ <Link href="/account" className="font-bold text-sky-700">افتح حساب العميل</Link> لعرضها كلها.</p>
            </Card>
          )}

          {orderQuery.isFetching && !bundle && (
            <Card className="mx-auto max-w-3xl border-0 bg-white/90 p-12 text-center shadow-xl">
              <Loader2 className="mx-auto mb-4 h-9 w-9 animate-spin text-sky-500" />
              <p className="font-bold text-slate-700">جاري جلب تفاصيل طلبك...</p>
            </Card>
          )}

          {orderQuery.error && !bundle && (
            <Card className="mx-auto max-w-3xl border border-red-100 bg-white/95 p-8 text-center shadow-xl">
              <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
              <h2 className="text-xl font-black text-slate-900">تعذر العثور على الطلب</h2>
              <p className="mt-2 leading-7 text-slate-600">تأكد من رقم الطلب وآخر أربعة أرقام من الجوال، أو امسح الباركود من الفاتورة.</p>
            </Card>
          )}

          {order && bundle && (
            <div className="mx-auto max-w-5xl space-y-6">
              <Card className="overflow-hidden border border-white/80 bg-white/92 shadow-2xl shadow-sky-900/10 backdrop-blur-xl">
                <div className="bg-gradient-to-l from-sky-500 to-cyan-400 p-6 text-white sm:p-8">
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-bold text-sky-50">طلب رقم</p>
                      <h2 className="mt-1 text-4xl font-black">#{order.barcode}</h2>
                      <p className="mt-2 text-sm text-sky-50">تم الإنشاء في {formatDate(order.createdAt)}</p>
                    </div>
                    {currentStatus && (
                      <div className="flex items-center gap-3 rounded-2xl bg-white/18 px-5 py-4 ring-1 ring-white/30 backdrop-blur-sm">
                        <StatusIcon className="h-8 w-8" />
                        <div><p className="text-xs font-bold text-sky-50">الحالة الحالية</p><strong className="text-lg">{currentStatus.label}</strong></div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-8 lg:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 p-4"><Smartphone className="mb-3 h-5 w-5 text-sky-600" /><p className="text-xs font-bold text-slate-500">الجهاز</p><p className="mt-1 font-black text-slate-900">{order.deviceInfo}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><Banknote className="mb-3 h-5 w-5 text-sky-600" /><p className="text-xs font-bold text-slate-500">السعر الإجمالي</p><p className="mt-1 font-black text-slate-900">{formatMoney(order.price, settings?.currency)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><Check className="mb-3 h-5 w-5 text-emerald-600" /><p className="text-xs font-bold text-slate-500">المدفوع</p><p className="mt-1 font-black text-slate-900">{formatMoney(order.amountPaid, settings?.currency)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><CalendarClock className="mb-3 h-5 w-5 text-sky-600" /><p className="text-xs font-bold text-slate-500">الإنجاز المتوقع</p><p className="mt-1 text-sm font-black leading-6 text-slate-900">{formatEstimatedSchedule(order.estimatedTime, order.estimatedCompletionAt)}</p></div>
                </div>
                {remaining > 0 && <div className="mx-5 mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm sm:mx-8 sm:mb-8"><span className="font-bold text-amber-800">المبلغ المتبقي</span><strong className="text-amber-950">{formatMoney(remaining, settings?.currency)}</strong></div>}
              </Card>

              {order.priceApprovalStatus === "pending" && (
                <Card className="border-2 border-orange-200 bg-orange-50/95 p-5 shadow-xl sm:p-7">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white"><Banknote className="h-6 w-6" /></span><div><h3 className="text-lg font-black text-slate-950">موافقتك مطلوبة قبل بدء العمل</h3><p className="mt-1 text-sm leading-6 text-slate-700">السعر المقترح هو <strong>{formatMoney(order.price, settings?.currency)}</strong>. اختر قرارك ليصل إلى المحل مباشرة.</p></div></div>
                    <div className="flex shrink-0 gap-3"><Button onClick={() => handleApproval("approved")} disabled={approvalMutation.isPending} className="bg-emerald-600 font-bold text-white hover:bg-emerald-700"><Check className="h-4 w-4" /> موافق</Button><Button onClick={() => handleApproval("rejected")} disabled={approvalMutation.isPending} variant="outline" className="border-red-200 bg-white text-red-700 hover:bg-red-50"><X className="h-4 w-4" /> غير موافق</Button></div>
                  </div>
                </Card>
              )}

              <PublicAdditionalRepairProposals token={order.publicToken} />
              <PublicPostDeliveryRating token={order.publicToken} />

              <Card className="border border-white/80 bg-white/92 p-5 shadow-xl backdrop-blur-xl sm:p-8">
                <div className="mb-6 flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-sky-600">تحديثات الطلب</p><h3 className="mt-1 text-2xl font-black text-slate-950">الخط الزمني</h3></div><Badge className={`ring-1 ${statusClasses[currentStatus?.color ?? "slate"]}`}>{currentStatus?.label}</Badge></div>
                <div className="space-y-0">
                  {bundle.history.map((event, index) => {
                    const config = statusConfig[event.toStatus as keyof typeof statusConfig] ?? statusConfig.pending;
                    const EventIcon = config.icon;
                    return <div key={event.id} className="relative flex gap-4 pb-7 last:pb-0">{index < bundle.history.length - 1 && <span className="absolute right-5 top-10 h-[calc(100%-1rem)] w-px bg-sky-200" />}<span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white shadow-md shadow-sky-500/20"><EventIcon className="h-5 w-5" /></span><div className="min-w-0 flex-1 pt-1"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-slate-900">{config.label}</strong><time className="text-xs font-semibold text-slate-500">{formatDate(event.createdAt)}</time></div><p className="mt-1 text-sm leading-6 text-slate-600">{event.note || config.description}</p></div></div>;
                  })}
                </div>
              </Card>

              {(order.customerVisibleNotes || bundle.photos.length > 0) && <div className="grid gap-6 lg:grid-cols-2">{order.customerVisibleNotes && <Card className="border border-white/80 bg-white/92 p-6 shadow-xl"><FileText className="mb-4 h-6 w-6 text-sky-600" /><h3 className="font-black text-slate-950">ملاحظات المحل</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{order.customerVisibleNotes}</p></Card>}{bundle.photos.length > 0 && <Card className="border border-white/80 bg-white/92 p-6 shadow-xl"><h3 className="mb-4 font-black text-slate-950">صور الجهاز</h3><div className="grid grid-cols-2 gap-3">{bundle.photos.map(photo => <figure key={photo.id} className="overflow-hidden rounded-xl bg-slate-100"><img src={photo.url} alt={photo.caption ?? "صورة الجهاز"} className="aspect-square w-full object-cover" />{photo.caption && <figcaption className="p-2 text-xs text-slate-600">{photo.caption}</figcaption>}</figure>)}</div></Card>}</div>}

              <Card className="border border-emerald-200 bg-emerald-50/95 p-6 shadow-xl"><div className="flex gap-4"><ShieldCheck className="h-8 w-8 shrink-0 text-emerald-600" /><div><h3 className="font-black text-emerald-950">ضمان الخدمة</h3><p className="mt-1 text-sm font-bold leading-7 text-emerald-800">{formatWarrantySchedule(order)}</p><p className="mt-1 text-xs leading-6 text-emerald-700">يبدأ احتساب الضمان عند تسليم الجهاز فعليًا.</p></div></div></Card>

              <Card className="border border-white/80 bg-slate-950 p-6 text-white shadow-2xl sm:p-8">
                <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center"><div><div className="mb-2 flex items-center gap-2 text-sky-300"><Headphones className="h-5 w-5" /><span className="text-sm font-bold">تحتاج مساعدة؟</span></div><h3 className="text-xl font-black">تواصل معنا واذكر رقم الطلب #{order.barcode}</h3>{settings?.openingHours && <p className="mt-2 text-sm text-slate-300">{settings.openingHours}</p>}</div><div className="flex flex-wrap gap-3"><a href={buildWhatsAppUrl(`مرحبًا، أستفسر عن الطلب رقم ${order.barcode}`)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 font-bold text-white hover:bg-emerald-600"><MessageCircle className="h-5 w-5" /> واتساب</a>{settings?.phone && <a href={`tel:${settings.phone}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 font-bold text-slate-950 hover:bg-sky-50"><Phone className="h-5 w-5" /> اتصال</a>}{settings?.mapUrl && <a href={settings.mapUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 px-4 font-bold text-white hover:bg-white/10"><MapPin className="h-5 w-5" /> الموقع</a>}</div></div>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
