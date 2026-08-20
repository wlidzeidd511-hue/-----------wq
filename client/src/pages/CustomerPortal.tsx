import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { CalendarClock, FileText, Gift, KeyRound, Loader2, LogOut, PackageCheck, ShieldCheck, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CustomerAdditionalRepairProposals } from "@/components/AdditionalRepairCustomerCards";
import { CustomerLoyaltyWelcome } from "@/components/CustomerLoyalty";
import { CustomerPostDeliveryRating } from "@/components/PostDeliveryRating";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { trpc } from "@/lib/trpc";
import { formatEstimatedSchedule, formatWarrantySchedule } from "@/lib/serviceDates";
import { STORE_APP_ICON_URL, STORE_LOGO_URL } from "@shared/siteConfig";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  pending: "تم الاستلام",
  diagnosing: "قيد الفحص",
  awaiting_approval: "بانتظار موافقتك",
  in_progress: "جاري العمل",
  ready: "جاهز للاستلام",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

function formatMoney(value: number) {
  return `${(value / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

function formatDate(value: Date | number | null | undefined) {
  return value ? new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" }) : "غير محدد";
}

export default function CustomerPortal() {
  const utils = trpc.useUtils();
  const meQuery = trpc.accounts.customer.me.useQuery(undefined, { retry: false });
  const authenticated = Boolean(meQuery.data?.authenticated);
  const ordersQuery = trpc.accounts.customer.orders.useQuery(undefined, { enabled: authenticated, retry: false, refetchInterval: 5_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const scratchQuery = trpc.scratch.customer.list.useQuery(undefined, { enabled: authenticated, retry: false, refetchInterval: 15_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const branchesQuery = trpc.platform.branches.publicList.useQuery(undefined, { retry: false });
  const [login, setLogin] = useState({ phone: "", password: "" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const detailQuery = trpc.accounts.customer.order.useQuery(
    { id: selectedId ?? 1 },
    { enabled: authenticated && selectedId !== null, retry: false, refetchInterval: selectedId !== null ? 5_000 : false, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true },
  );
  const loginMutation = trpc.accounts.customer.login.useMutation();
  const logoutMutation = trpc.accounts.customer.logout.useMutation();
  const passwordMutation = trpc.accounts.customer.changePassword.useMutation();

  useEffect(() => {
    if (!authenticated || !("serviceWorker" in navigator)) return;
    const refresh = () => {
      void ordersQuery.refetch();
      void scratchQuery.refetch();
      if (selectedId !== null) void detailQuery.refetch();
    };
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
  }, [authenticated, detailQuery.refetch, ordersQuery.refetch, scratchQuery.refetch, selectedId]);

  const branchName = (branchId: number | null | undefined) => branchesQuery.data?.find(branch => branch.id === branchId)?.name ?? "هاتف التميز";

  async function handleLogin() {
    try {
      await loginMutation.mutateAsync({ phone: login.phone, password: login.password });
      setLogin({ phone: "", password: "" });
      await utils.accounts.customer.invalidate();
    } catch {
      toast.error("رقم الجوال أو كلمة المرور غير صحيحة");
    }
  }

  async function handlePassword() {
    if (passwords.newPassword !== passwords.confirm) return toast.error("تأكيد كلمة المرور غير مطابق");
    try {
      await passwordMutation.mutateAsync({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      setPasswords({ currentPassword: "", newPassword: "", confirm: "" });
      setPasswordOpen(false);
      toast.success("تم تحديث كلمة المرور");
    } catch {
      toast.error("تعذر تغيير كلمة المرور؛ تحقق من الحالية");
    }
  }

  if (meQuery.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-sky-500" /></div>;

  if (!authenticated) {
    return <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-50 to-white p-4" dir="rtl"><Card className="w-full max-w-md border-white bg-white/95 p-6 shadow-2xl"><Link href="/" className="mx-auto block w-fit"><img src={STORE_LOGO_URL} alt="الشعار الرسمي لهاتف التميز للاتصالات" className="h-28 w-40 object-contain drop-shadow-md" /></Link><h1 className="mt-4 text-center text-2xl font-black">حساب العميل</h1><p className="mt-2 text-center text-sm leading-6 text-slate-500">يعرض فواتيرك وأجهزتك وصورها وحالة الصيانة والضمان. لا تحتاج للدخول لتتبّع طلب واحد.</p><div className="mt-6 space-y-4"><label className="block space-y-2"><span className="text-sm font-bold">رقم الجوال</span><Input value={login.phone} onChange={event => setLogin({ ...login, phone: event.target.value })} inputMode="tel" dir="ltr" /></label><label className="block space-y-2"><span className="text-sm font-bold">كلمة المرور</span><Input type="password" value={login.password} onChange={event => setLogin({ ...login, password: event.target.value })} onKeyDown={event => event.key === "Enter" && handleLogin()} /></label><Button onClick={handleLogin} disabled={loginMutation.isPending} className="w-full bg-sky-500 font-bold text-white hover:bg-sky-600">{loginMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}دخول</Button><Link href="/track" className="block text-center text-sm font-bold text-sky-700">أبي أتتبع طلب واحد بدون تسجيل دخول</Link></div></Card></main>;
  }

  const customer = meQuery.data?.customer;
  const orders = ordersQuery.data ?? [];
  const scratchCodes = scratchQuery.data ?? [];
  const latestDeliveredOrder = orders.find(order => order.status === "delivered");
  return <div className="min-h-screen bg-slate-50" dir="rtl">
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur-xl"><div className="container flex min-h-20 flex-wrap items-center justify-between gap-3 py-3"><Link href="/" className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white p-0.5 shadow-sm ring-1 ring-sky-100"><img src={STORE_APP_ICON_URL} alt="الشعار الرسمي لهاتف التميز" className="h-full w-full object-contain" /></span><div><h1 className="text-xl font-black">حسابي</h1><p className="text-xs text-slate-500">{customer?.name || customer?.phoneDisplay}</p></div></Link><div className="flex gap-2"><Button variant="outline" onClick={() => setPasswordOpen(true)}><KeyRound className="h-4 w-4" /><span className="hidden sm:inline">كلمة المرور</span></Button><Button variant="outline" onClick={() => logoutMutation.mutateAsync().then(() => utils.accounts.customer.invalidate())}><LogOut className="h-4 w-4" />خروج</Button></div></div></header>
    <main className="container space-y-6 py-8">
      <PushNotificationToggle mode="customer" />
      {meQuery.data?.loyalty && <CustomerLoyaltyWelcome profile={meQuery.data.loyalty} customerName={customer?.name} />}
      {latestDeliveredOrder && <CustomerPostDeliveryRating orderId={latestDeliveredOrder.id} />}
      <section className="grid gap-4 sm:grid-cols-3"><Card className="p-5"><FileText className="h-5 w-5 text-sky-600" /><p className="mt-3 text-sm font-bold text-slate-500">كل الفواتير</p><p className="mt-1 text-3xl font-black">{orders.length}</p></Card><Card className="p-5"><PackageCheck className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-sm font-bold text-slate-500">أجهزة جاهزة</p><p className="mt-1 text-3xl font-black">{orders.filter(order => order.status === "ready").length}</p></Card><Card className="p-5"><Gift className="h-5 w-5 text-violet-600" /><p className="mt-3 text-sm font-bold text-slate-500">الجوائز والأكواد</p><p className="mt-1 text-3xl font-black text-violet-700">{scratchCodes.length}</p></Card></section>
      {scratchCodes.length > 0 && <Card className="overflow-hidden border-violet-200"><div className="border-b bg-violet-50 p-5"><h2 className="text-xl font-black text-violet-950">أكواد اكشط واربح</h2><p className="mt-1 text-sm text-violet-800">كل كود مربوط بفاتورتك ويُستخدم مرة واحدة خلال 72 ساعة من التسليم.</p></div><div className="grid gap-4 p-5 lg:grid-cols-2">{scratchCodes.map(code => <article key={code.id} className="rounded-2xl border border-violet-100 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-violet-700">فاتورة #{code.orderBarcode} · {code.branchName}</p><h3 className="mt-1 font-black">{code.deviceInfo}</h3></div><Badge variant={code.status === "assigned" ? "default" : "secondary"}>{code.status === "assigned" ? "جاهز للكشط" : code.status === "redeemed" ? "تم الكشف" : "انتهى"}</Badge></div>{code.status === "redeemed" && <p className="mt-3 font-bold text-slate-700">{code.isWinning ? `فزت: ${code.prizeName}` : "حظ أوفر بالمرة الجاية"}</p>}<p className="mt-3 text-xs text-slate-500">ينتهي: {formatDate(code.expiresAt)}</p><Link href={`/scratch/${code.publicCode}`} className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-violet-600 font-bold text-white">{code.status === "assigned" ? "اكشط الآن" : "عرض النتيجة"}</Link></article>)}</div></Card>}
      <Card className="overflow-hidden"><div className="border-b p-5"><h2 className="text-xl font-black">فواتيري وأجهزتي</h2><p className="mt-1 text-sm text-slate-500">كل فاتورة جديدة بنفس رقم الجوال ترتبط بهذا الحساب تلقائيًا.</p></div>{orders.length === 0 ? <div className="p-10 text-center text-slate-500">لا توجد فواتير مرتبطة بالحساب حاليًا.</div> : <div className="grid gap-4 p-5 lg:grid-cols-2">{orders.map(order => <article key={order.id} className="rounded-2xl border bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-sky-600">فاتورة #{order.barcode} · {branchName(order.branchId)}</p><h3 className="mt-1 font-black">{order.deviceInfo}</h3><p className="mt-2 text-sm text-slate-500">{formatDate(order.createdAt)}</p></div><Badge>{statusLabels[order.status] ?? order.status}</Badge></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">الإجمالي</span><strong className="mt-1 block">{formatMoney(order.price)}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">الضمان</span><strong className="mt-1 block text-xs leading-6">{formatWarrantySchedule(order)}</strong></div><div className="col-span-2 rounded-xl bg-sky-50 p-3"><span className="text-sky-700">الإنجاز المتوقع</span><strong className="mt-1 block text-xs leading-6 text-slate-900">{formatEstimatedSchedule(order.estimatedTime, order.estimatedCompletionAt)}</strong></div></div><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setSelectedId(order.id)}><Smartphone className="h-4 w-4" />التفاصيل والصور</Button><a href={`/invoice?t=${order.publicToken}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-md bg-sky-500 px-4 text-sm font-bold text-white">الفاتورة</a></div></article>)}</div>}</Card>
    </main>

    <Dialog open={selectedId !== null} onOpenChange={open => !open && setSelectedId(null)}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto bg-white" dir="rtl"><DialogHeader><DialogTitle className="text-2xl font-black">تفاصيل الجهاز والفاتورة</DialogTitle><DialogDescription>تظهر لك فقط البيانات المخصصة للعميل.</DialogDescription></DialogHeader>{detailQuery.isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-500" /> : detailQuery.data && <div className="space-y-5"><Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-sky-600">#{detailQuery.data.order.barcode} · {branchName(detailQuery.data.order.branchId)}</p><h3 className="mt-1 text-lg font-black">{detailQuery.data.order.deviceInfo}</h3></div><Badge>{statusLabels[detailQuery.data.order.status] ?? detailQuery.data.order.status}</Badge></div></Card><div className="grid gap-3 sm:grid-cols-2"><Card className="p-4"><CalendarClock className="h-5 w-5 text-sky-600" /><p className="mt-2 text-sm text-slate-500">الإنجاز المتوقع</p><strong className="text-sm leading-6">{formatEstimatedSchedule(detailQuery.data.order.estimatedTime, detailQuery.data.order.estimatedCompletionAt)}</strong></Card><Card className="p-4"><ShieldCheck className="h-5 w-5 text-emerald-600" /><p className="mt-2 text-sm text-slate-500">الضمان</p><strong className="text-sm leading-6">{formatWarrantySchedule(detailQuery.data.order)}</strong></Card></div><Card className="p-5"><h3 className="mb-4 font-black">تحديثات الصيانة</h3><div className="space-y-4">{detailQuery.data.history.map(event => <div key={event.id} className="border-r-2 border-sky-300 pr-4"><div className="flex justify-between gap-2"><strong>{statusLabels[event.toStatus] ?? event.toStatus}</strong><time className="text-xs text-slate-400">{formatDate(event.createdAt)}</time></div>{event.note && <p className="mt-1 text-sm text-slate-600">{event.note}</p>}</div>)}</div></Card>{detailQuery.data.photos.length > 0 && <Card className="p-5"><h3 className="mb-4 font-black">صور الجهاز</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{detailQuery.data.photos.map(photo => <figure key={photo.id} className="overflow-hidden rounded-xl bg-slate-100"><img src={photo.url} alt={photo.caption || "صورة الجهاز"} className="aspect-square w-full object-cover" />{photo.caption && <figcaption className="p-2 text-xs">{photo.caption}</figcaption>}</figure>)}</div></Card>}</div>}</DialogContent></Dialog>

    <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}><DialogContent className="max-w-md bg-white" dir="rtl"><DialogHeader><DialogTitle className="text-xl font-black">تغيير كلمة المرور</DialogTitle><DialogDescription>استخدم 8 أحرف على الأقل.</DialogDescription></DialogHeader><div className="space-y-3"><Input type="password" placeholder="كلمة المرور الحالية" value={passwords.currentPassword} onChange={event => setPasswords({ ...passwords, currentPassword: event.target.value })} /><Input type="password" placeholder="كلمة المرور الجديدة" value={passwords.newPassword} onChange={event => setPasswords({ ...passwords, newPassword: event.target.value })} /><Input type="password" placeholder="تأكيد الجديدة" value={passwords.confirm} onChange={event => setPasswords({ ...passwords, confirm: event.target.value })} /><Button onClick={handlePassword} disabled={passwordMutation.isPending} className="w-full bg-sky-500 font-bold text-white">حفظ</Button></div></DialogContent></Dialog>
    {selectedId !== null && typeof document !== "undefined" && document.querySelector('[role="dialog"]') && createPortal(
      <CustomerAdditionalRepairProposals orderId={selectedId} />,
      document.querySelector('[role="dialog"]')!,
    )}
  </div>;
}
