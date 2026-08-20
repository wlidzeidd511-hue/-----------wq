import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, ShieldCheck, UserCog } from "lucide-react";
import { ServiceBackdrop } from "@/components/ServiceBackdrop";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { STORE_LOGO_URL } from "@shared/siteConfig";
import { toast } from "sonner";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const [accessMode, setAccessMode] = useState<"choice" | "owner">("choice");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const sessionQuery = trpc.owner.me.useQuery(undefined, { retry: false });
  const loginMutation = trpc.owner.login.useMutation();

  useEffect(() => {
    if (sessionQuery.data?.authenticated) navigate("/dashboard/branches");
  }, [navigate, sessionQuery.data]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    try {
      const result = await loginMutation.mutateAsync({ password });
      if (result.mustChangeDefaultPassword) {
        sessionStorage.setItem("mustChangeOwnerPassword", "true");
      }
      toast.success("تم تسجيل الدخول بأمان");
      navigate("/dashboard/branches");
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "تعذر تسجيل الدخول";
      setError(message);
      setPassword("");
      toast.error("كلمة المرور غير صحيحة");
    }
  };

  return (
    <div className="page-background min-h-screen px-4 py-10" dir="rtl">
      <ServiceBackdrop />
      <div className="page-content mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <Card className="w-full border border-white/80 bg-white/90 p-6 shadow-2xl shadow-sky-900/10 backdrop-blur-xl sm:p-8">
          <div className="mb-8 text-center">
            <img src={STORE_LOGO_URL} alt="الشعار الرسمي لهاتف التميز للاتصالات" className="mx-auto mb-5 h-28 w-40 object-contain drop-shadow-md" />
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              جلسة مشفرة ومحمية
            </div>
            <h1 className="text-2xl font-black text-slate-950">الدخول إلى نظام المحل</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              اختر نوع الحساب، وكل مستخدم يشوف الفرع والصلاحيات الممنوحة له فقط.
            </p>
          </div>

          {accessMode === "choice" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setAccessMode("owner")}
                  className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-right transition hover:border-sky-400 hover:bg-sky-100 active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm"><ShieldCheck className="h-6 w-6" /></span>
                  <strong className="mt-4 block text-lg text-slate-950">مالك</strong>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">إدارة الفروع والموظفين والطلبات والتقارير</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/team")}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-right transition hover:border-emerald-400 hover:bg-emerald-100 active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm"><UserCog className="h-6 w-6" /></span>
                  <strong className="mt-4 block text-lg text-slate-950">موظف</strong>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">دخول باليوزر وكلمة المرور المحددة من المالك</span>
                </button>
              </div>
              <Button type="button" variant="outline" onClick={() => navigate("/")} className="w-full bg-white font-bold text-slate-700">
                <ArrowRight className="h-4 w-4" />رجوع للصفحة الرئيسية
              </Button>
            </div>
          )}

          {accessMode === "owner" && error && (
            <div className="mb-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {accessMode === "owner" && <form onSubmit={handleLogin} className="space-y-5">
            <button type="button" onClick={() => { setAccessMode("choice"); setError(""); setPassword(""); }} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-sky-700">
              <ArrowRight className="h-4 w-4" />رجوع لاختيار نوع الحساب
            </button>
            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4"><p className="font-black text-sky-950">دخول المالك</p><p className="mt-1 text-xs font-bold text-sky-700">أدخل كلمة المالك ثم اختر الفرع المحمي.</p></div>
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-800" htmlFor="owner-password">
                كلمة المرور
              </label>
              <div className="relative">
                <Input
                  id="owner-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  disabled={loginMutation.isPending}
                  className="h-12 border-sky-200 bg-white pl-12 text-base focus-visible:ring-sky-500"
                  autoComplete="current-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(value => !value)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loginMutation.isPending || password.length < 5}
              className="h-12 w-full bg-sky-500 text-base font-bold text-white shadow-lg shadow-sky-500/20 hover:bg-sky-600"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  جاري التحقق...
                </>
              ) : (
                "دخول لوحة المالك"
              )}
            </Button>
          </form>}

          <p className="mt-7 text-center text-xs leading-5 text-slate-500">
            هاتف التميز للاتصالات · وصول محمي للمالك والموظفين
          </p>
        </Card>
      </div>
    </div>
  );
}
