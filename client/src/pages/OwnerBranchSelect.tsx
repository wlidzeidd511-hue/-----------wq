import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Building2, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { ServiceBackdrop } from "@/components/ServiceBackdrop";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { OWNER_LOGIN_PATH } from "@/ownerPortal";
import { STORE_LOGO_URL } from "@shared/siteConfig";
import { toast } from "sonner";

export default function OwnerBranchSelect() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const ownerQuery = trpc.owner.me.useQuery(undefined, { retry: false });
  const branchesQuery = trpc.branchAccess.list.useQuery(undefined, { enabled: Boolean(ownerQuery.data?.authenticated), retry: false });
  const currentQuery = trpc.branchAccess.me.useQuery(undefined, { enabled: Boolean(ownerQuery.data?.authenticated), retry: false });
  const unlock = trpc.branchAccess.unlock.useMutation();
  const initialize = trpc.branchAccess.initialize.useMutation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const selected = useMemo(() => branchesQuery.data?.find(branch => branch.id === selectedId), [branchesQuery.data, selectedId]);
  const pending = unlock.isPending || initialize.isPending;

  useEffect(() => {
    if (!ownerQuery.isLoading && !ownerQuery.data?.authenticated) navigate(OWNER_LOGIN_PATH);
  }, [navigate, ownerQuery.data?.authenticated, ownerQuery.isLoading]);

  function chooseBranch(id: number) {
    setSelectedId(id);
    setPassword("");
    setConfirmPassword("");
  }

  async function enterBranch(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return toast.error("اختر الفرع أولًا");
    if (!selected.protectionConfigured && password !== confirmPassword) return toast.error("تأكيد كلمة الحماية غير مطابق");
    try {
      const result = selected.protectionConfigured
        ? await unlock.mutateAsync({ branchId: selected.id, password })
        : await initialize.mutateAsync({ branchId: selected.id, newPassword: password });
      window.localStorage.setItem("hattef-owner-branch-id", String(result.branch.branchId));
      await utils.branchAccess.me.invalidate();
      toast.success(`تم فتح ${result.branch.branchName} بأمان`);
      navigate("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فتح الفرع");
      setPassword("");
      setConfirmPassword("");
    }
  }

  if (ownerQuery.isLoading || branchesQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-sky-50"><Loader2 className="h-9 w-9 animate-spin text-sky-500" /></div>;
  }

  return (
    <div className="page-background min-h-screen px-4 py-8" dir="rtl">
      <ServiceBackdrop />
      <main className="page-content mx-auto max-w-4xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><img src={STORE_LOGO_URL} alt="الشعار الرسمي لهاتف التميز" className="h-20 w-28 object-contain" /><div><p className="text-xs font-black text-sky-700">لوحة المالك</p><h1 className="text-2xl font-black text-slate-950">اختر الفرع المراد إدارته</h1></div></div>
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-white/80 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm"><ArrowRight className="h-4 w-4" />الرئيسية</Link>
        </div>

        {currentQuery.data?.authenticated && (
          <Card className="mb-6 border-emerald-200 bg-emerald-50/90 p-4 text-sm font-bold text-emerald-900">
            <ShieldCheck className="ml-2 inline h-5 w-5" />الفرع المفتوح حاليًا: {currentQuery.data.branch?.branchName}. يمكنك اختياره من جديد أو فتح فرع آخر بكلمة حمايته.
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {branchesQuery.data?.map(branch => (
            <button key={branch.id} type="button" onClick={() => chooseBranch(branch.id)} className={`rounded-3xl border p-6 text-right shadow-lg transition ${selectedId === branch.id ? "border-sky-500 bg-sky-50 ring-4 ring-sky-100" : "border-white/80 bg-white/82 hover:-translate-y-0.5 hover:border-sky-200"}`}>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white"><Building2 className="h-6 w-6" /></span>
              <h2 className="mt-4 text-xl font-black text-slate-950">{branch.name}</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">{branch.protectionConfigured ? "محمي بكلمة مستقلة" : "يلزم تهيئة كلمة حماية لأول مرة"}</p>
            </button>
          ))}
        </div>

        {selected && (
          <Card className="mx-auto mt-6 max-w-xl border border-white/80 bg-white/92 p-6 shadow-2xl backdrop-blur-xl">
            <div className="mb-5 flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white"><LockKeyhole className="h-5 w-5" /></span><div><h2 className="text-lg font-black text-slate-950">{selected.protectionConfigured ? `أدخل كلمة حماية ${selected.name}` : `تهيئة حماية ${selected.name}`}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{selected.protectionConfigured ? "هذه الجلسة خاصة بهذا الفرع وتنتهي تلقائيًا بعد 30 دقيقة." : "اختر كلمة مستقلة قوية. ستُطلب عند فتح هذا الفرع لاحقًا."}</p></div></div>
            <form onSubmit={enterBranch} className="space-y-4">
              <label className="block"><span className="mb-2 block text-sm font-bold text-slate-800">{selected.protectionConfigured ? "كلمة حماية الفرع" : "كلمة الحماية الجديدة"}</span><div className="relative"><Input type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} autoComplete={selected.protectionConfigured ? "current-password" : "new-password"} className="h-12 bg-white pl-12" autoFocus /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></label>
              {!selected.protectionConfigured && <label className="block"><span className="mb-2 block text-sm font-bold text-slate-800">تأكيد كلمة الحماية</span><Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" className="h-12 bg-white" /><small className="mt-2 block leading-5 text-slate-500">8 خانات أو أكثر، وفيها حرف كبير وصغير ورقم ورمز خاص.</small></label>}
              <Button type="submit" disabled={pending || password.length < (selected.protectionConfigured ? 1 : 8)} className="h-12 w-full bg-sky-500 font-black text-white hover:bg-sky-600">{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}{selected.protectionConfigured ? "فتح لوحة هذا الفرع" : "حفظ الحماية وفتح الفرع"}</Button>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}
