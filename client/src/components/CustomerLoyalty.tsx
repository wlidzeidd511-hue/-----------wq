import { useEffect, useState } from "react";
import { Award, Crown, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

type LoyaltyProfile = {
  tier: "new" | "regular" | "distinguished" | "vip";
  label: string;
  message: string;
  orderCount: number;
  deliveredCount: number;
  totalDeliveredSpend: number;
};

const tierStyles: Record<LoyaltyProfile["tier"], string> = {
  new: "from-sky-500 to-cyan-400 shadow-sky-500/20",
  regular: "from-emerald-500 to-teal-400 shadow-emerald-500/20",
  distinguished: "from-violet-600 to-fuchsia-500 shadow-violet-500/20",
  vip: "from-slate-950 via-indigo-950 to-violet-900 shadow-violet-950/25",
};

export function CustomerLoyaltyWelcome({ profile, customerName }: { profile: LoyaltyProfile; customerName?: string | null }) {
  return <Card className={`overflow-hidden border-0 bg-gradient-to-l ${tierStyles[profile.tier]} p-6 text-white shadow-xl`}>
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-start gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"><Crown className="h-7 w-7" /></span><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-white/80">ياهلا {customerName || "بك"}</p><Badge className="border border-white/20 bg-white/15 text-white hover:bg-white/20">{profile.label}</Badge></div><h2 className="mt-2 text-xl font-black sm:text-2xl">{profile.message}</h2><p className="mt-2 text-sm text-white/75">تعاملاتك المسجلة: {profile.orderCount.toLocaleString("ar-SA")} · الأجهزة المستلمة: {profile.deliveredCount.toLocaleString("ar-SA")}</p></div></div><Sparkles className="hidden h-12 w-12 text-white/40 sm:block" /></div>
  </Card>;
}

export function OwnerCustomerLoyaltyBadge({ orderId }: { orderId: number }) {
  const query = trpc.accounts.orderLoyalty.useQuery({ orderId }, { retry: false });
  if (query.isLoading) return <Card className="mt-4 flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />جاري حساب وسام العميل...</Card>;
  if (!query.data) return null;
  return <Card className="mt-4 border-violet-200 bg-violet-50 p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white"><Award className="h-5 w-5" /></span><div><p className="text-xs font-bold text-violet-700">وسام العميل</p><h3 className="font-black text-violet-950">{query.data.label}</h3></div></div><Badge className="bg-violet-600 text-white">{query.data.orderCount} طلب</Badge></div><p className="mt-3 text-xs text-violet-800">مكتمل: {query.data.deliveredCount} · قيمة التعاملات المكتملة: {(query.data.totalDeliveredSpend / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</p></Card>;
}

export function LoyaltyThresholdSettings() {
  const utils = trpc.useUtils();
  const owner = trpc.owner.me.useQuery(undefined, { retry: false });
  const settings = owner.data?.settings;
  const [form, setForm] = useState({ regularOrders: "3", distinguishedSpend: "1500", vipSpend: "5000" });
  useEffect(() => {
    if (!settings) return;
    setForm({
      regularOrders: String(settings.loyaltyRegularOrderThreshold),
      distinguishedSpend: String(settings.loyaltyDistinguishedSpendThreshold / 100),
      vipSpend: String(settings.loyaltyVipSpendThreshold / 100),
    });
  }, [settings]);
  const update = trpc.settings.update.useMutation({
    onSuccess: async () => {
      toast.success("تم حفظ حدود أوسمة العملاء");
      await utils.owner.me.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const save = () => {
    const regularOrders = Math.max(1, Math.round(Number(form.regularOrders)));
    const distinguishedSpend = Math.max(0, Math.round(Number(form.distinguishedSpend) * 100));
    const vipSpend = Math.max(0, Math.round(Number(form.vipSpend) * 100));
    if (!Number.isFinite(regularOrders + distinguishedSpend + vipSpend) || vipSpend < distinguishedSpend) return toast.error("تأكد من الحدود وأن حد VIP أعلى من حد العميل المميز");
    update.mutate({ loyaltyRegularOrderThreshold: regularOrders, loyaltyDistinguishedSpendThreshold: distinguishedSpend, loyaltyVipSpendThreshold: vipSpend });
  };
  return <Card className="mt-5 border-violet-200 bg-violet-50 p-5"><div className="mb-4"><h3 className="font-black text-violet-950">حدود أوسمة العملاء</h3><p className="mt-1 text-xs text-violet-700">العميل الجديد تلقائيًا، ثم الدائم بعد عدد الطلبات، والمميز وVIP حسب قيمة الفواتير المسلّمة.</p></div><div className="grid gap-3 sm:grid-cols-3"><label className="space-y-2 text-sm font-bold text-slate-700">الدائم بعد عدد طلبات<Input type="number" min="1" value={form.regularOrders} onChange={event => setForm({ ...form, regularOrders: event.target.value })} className="bg-white" /></label><label className="space-y-2 text-sm font-bold text-slate-700">المميز بعد (ريال)<Input type="number" min="0" value={form.distinguishedSpend} onChange={event => setForm({ ...form, distinguishedSpend: event.target.value })} className="bg-white" /></label><label className="space-y-2 text-sm font-bold text-slate-700">VIP بعد (ريال)<Input type="number" min="0" value={form.vipSpend} onChange={event => setForm({ ...form, vipSpend: event.target.value })} className="bg-white" /></label></div><Button onClick={save} disabled={update.isPending} className="mt-4 w-full bg-violet-600 font-bold text-white hover:bg-violet-700">{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ حدود الأوسمة</Button></Card>;
}
