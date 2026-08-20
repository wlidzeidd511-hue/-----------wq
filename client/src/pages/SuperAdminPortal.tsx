import { useEffect, useMemo, useState } from "react";
import { startAuthentication, startRegistration, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";
import { useLocation } from "wouter";
import { Building2, CheckCircle2, Download, Fingerprint, KeyRound, Loader2, LockKeyhole, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { ServiceBackdrop } from "@/components/ServiceBackdrop";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { STORE_LOGO_URL } from "@shared/siteConfig";
import { toast } from "sonner";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function readEnrollmentToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("enroll")?.trim() ?? "";
}

export default function SuperAdminPortal() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const enrollmentToken = useMemo(readEnrollmentToken, []);
  const [supportsPasskey, setSupportsPasskey] = useState<boolean | null>(null);
  const [platformPasskey, setPlatformPasskey] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [workingLabel, setWorkingLabel] = useState<string | null>(null);
  const [error, setError] = useState("");

  const statusQuery = trpc.superAdmin.status.useQuery(undefined, { retry: false });
  const sessionQuery = trpc.superAdmin.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: true });
  const branchesQuery = trpc.superAdmin.branches.useQuery(undefined, {
    enabled: Boolean(sessionQuery.data?.authenticated),
    retry: false,
  });
  const registrationOptions = trpc.superAdmin.registrationOptions.useMutation();
  const verifyRegistration = trpc.superAdmin.verifyRegistration.useMutation();
  const authenticationOptions = trpc.superAdmin.authenticationOptions.useMutation();
  const verifyAuthentication = trpc.superAdmin.verifyAuthentication.useMutation();
  const enterBranch = trpc.superAdmin.enterBranch.useMutation();
  const logout = trpc.superAdmin.logout.useMutation();

  useEffect(() => {
    setSupportsPasskey(browserSupportsWebAuthn());
    platformAuthenticatorIsAvailable().then(setPlatformPasskey).catch(() => setPlatformPasskey(false));

    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previousManifest = manifest?.getAttribute("href") ?? null;
    if (manifest) manifest.setAttribute("href", "/owner-control.webmanifest?v=2");

    const previousTitle = document.title;
    document.title = "تحكم المالك — هاتف التميز";
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const createdRobots = !robots;
    const previousRobots = robots?.content;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content = "noindex,nofollow,noarchive";
    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const previousAppleTitle = appleTitle?.content;
    if (appleTitle) appleTitle.content = "تحكم المالك";

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      if (manifest && previousManifest) manifest.setAttribute("href", previousManifest);
      document.title = previousTitle;
      if (appleTitle && previousAppleTitle) appleTitle.content = previousAppleTitle;
      if (createdRobots) robots?.remove();
      else if (robots && previousRobots) robots.content = previousRobots;
    };
  }, []);

  async function refreshSession() {
    await Promise.all([
      utils.superAdmin.status.invalidate(),
      utils.superAdmin.me.invalidate(),
      utils.superAdmin.branches.invalidate(),
    ]);
  }

  async function activatePasskey() {
    if (!enrollmentToken) return;
    setError("");
    setWorkingLabel("جاري تجهيز بصمة جهازك...");
    try {
      const optionsJSON = await registrationOptions.mutateAsync({ token: enrollmentToken });
      const response = await startRegistration({ optionsJSON });
      await verifyRegistration.mutateAsync({
        response,
        deviceName: platformPasskey ? "جهاز المالك بالبصمة" : "جهاز المالك",
      });
      window.history.replaceState({}, document.title, window.location.pathname);
      await refreshSession();
      toast.success("تم تفعيل دخولك الخاص بالبصمة");
    } catch (activationError) {
      const message = activationError instanceof Error ? activationError.message : "تعذر تفعيل بصمة الجهاز";
      if (!/NotAllowedError|The operation either timed out or was not allowed/i.test(message)) setError(message);
    } finally {
      setWorkingLabel(null);
    }
  }

  async function loginWithPasskey() {
    setError("");
    setWorkingLabel("بانتظار بصمة الوجه أو الإصبع...");
    try {
      const optionsJSON = await authenticationOptions.mutateAsync();
      const response = await startAuthentication({ optionsJSON });
      await verifyAuthentication.mutateAsync({ response });
      await refreshSession();
      toast.success("تم فتح بوابة المالك");
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "تعذر التحقق من بصمة الجهاز";
      if (!/NotAllowedError|The operation either timed out or was not allowed/i.test(message)) setError(message);
    } finally {
      setWorkingLabel(null);
    }
  }

  async function openBranch(branchId: number, branchName: string) {
    setError("");
    setWorkingLabel(`جاري فتح ${branchName}...`);
    try {
      const result = await enterBranch.mutateAsync({ branchId });
      window.localStorage.setItem("hattef-owner-branch-id", String(result.branch.branchId));
      toast.success(`تم فتح ${result.branch.branchName} بدون تغيير كلمة حمايته`);
      navigate("/dashboard");
    } catch (branchError) {
      setError(branchError instanceof Error ? branchError.message : "تعذر فتح الفرع");
      setWorkingLabel(null);
    }
  }

  async function handleInstall() {
    if (!installPrompt) {
      setInstallHelpOpen(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") toast.success("تمت إضافة بوابة التحكم إلى جهازك");
    setInstallPrompt(null);
  }

  async function handleLogout() {
    await logout.mutateAsync();
    await refreshSession();
    toast.success("تم قفل بوابة المالك");
  }

  const loading = statusQuery.isLoading || sessionQuery.isLoading;
  const authenticated = Boolean(sessionQuery.data?.authenticated);
  const configured = Boolean(statusQuery.data?.configured);

  return (
    <div className="page-background min-h-screen px-4 py-8" dir="rtl">
      <ServiceBackdrop />
      <main className="page-content mx-auto max-w-5xl">
        <header className="mb-7 flex flex-col gap-4 rounded-3xl border border-white/80 bg-white/88 p-5 shadow-xl backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <img src={STORE_LOGO_URL} alt="الشعار الرسمي لهاتف التميز" className="h-20 w-28 object-contain" />
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge className="bg-slate-950 text-white">خاص بالمالك</Badge>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">لا تظهر للزبائن</Badge>
              </div>
              <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">بوابة التحكم الخاصة</h1>
              <p className="mt-1 text-sm font-semibold text-slate-500">دخول بالبصمة إلى أي فرع، بدون المرور بالموقع العام.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleInstall} className="bg-white font-bold"><Download className="h-4 w-4" />تثبيت كأيقونة</Button>
            {authenticated && <Button type="button" variant="outline" onClick={handleLogout} disabled={logout.isPending} className="border-red-200 bg-red-50 font-bold text-red-700"><LogOut className="h-4 w-4" />قفل البوابة</Button>}
          </div>
        </header>

        {error && <Card className="mb-6 border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</Card>}

        {loading ? (
          <Card className="flex min-h-72 items-center justify-center bg-white/90"><Loader2 className="h-10 w-10 animate-spin text-sky-500" /></Card>
        ) : !supportsPasskey ? (
          <Card className="mx-auto max-w-xl border-amber-200 bg-amber-50 p-7 text-center shadow-xl">
            <LockKeyhole className="mx-auto h-12 w-12 text-amber-700" />
            <h2 className="mt-4 text-xl font-black text-amber-950">هذا المتصفح لا يدعم الدخول بالبصمة</h2>
            <p className="mt-2 leading-7 text-amber-800">افتح البوابة من Safari في iPhone أو Chrome/Edge حديث على الكمبيوتر.</p>
          </Card>
        ) : authenticated ? (
          <section className="space-y-6">
            <Card className="border-emerald-200 bg-emerald-50/92 p-5 shadow-lg">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-emerald-700" /><div><h2 className="font-black text-emerald-950">تم التحقق من جهاز المالك</h2><p className="mt-1 text-sm leading-6 text-emerald-800">اختر الفرع وتدخل مباشرة. كلمات حماية الفروع والمالك والموظفين باقية كما هي ولم تتغير.</p></div></div>
                <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-800"><Fingerprint className="h-5 w-5" />جلسة بصمة نشطة</div>
              </div>
            </Card>

            <div>
              <p className="text-xs font-black text-sky-700">اختيار مباشر</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">أي فرع تبي تديره؟</h2>
              <p className="mt-2 text-sm text-slate-600">الدخول من هنا لا يغير كلمة حماية الفرع ولا يلغيها.</p>
            </div>

            {branchesQuery.isLoading ? <Card className="flex min-h-52 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></Card> : (
              <div className="grid gap-4 sm:grid-cols-2">
                {branchesQuery.data?.map(branch => (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => openBranch(branch.id, branch.name)}
                    disabled={Boolean(workingLabel)}
                    className="group rounded-3xl border border-white/80 bg-white/92 p-6 text-right shadow-xl transition hover:-translate-y-1 hover:border-sky-300 hover:shadow-2xl disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-lg shadow-sky-500/20"><Building2 className="h-7 w-7" /></span>
                    <div className="mt-5 flex items-end justify-between gap-4"><div><h3 className="text-xl font-black text-slate-950">{branch.name}</h3><p className="mt-2 text-sm font-semibold text-slate-500">{branch.protectionConfigured ? "كلمة الحماية مفعّلة ومحفوظة" : "حماية الفرع غير مهيأة بعد"}</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 transition group-hover:bg-sky-500 group-hover:text-white"><KeyRound className="h-5 w-5" /></span></div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : !configured && enrollmentToken ? (
          <Card className="mx-auto max-w-xl border-sky-200 bg-white/94 p-7 text-center shadow-2xl backdrop-blur-xl sm:p-9">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-sky-500 text-white shadow-xl shadow-sky-500/20"><Fingerprint className="h-10 w-10" /></span>
            <h2 className="mt-6 text-2xl font-black text-slate-950">تفعيل جهاز المالك لأول مرة</h2>
            <p className="mt-3 leading-7 text-slate-600">اضغط الزر وسيطلب جهازك Face ID أو البصمة أو رمز قفل الجهاز. رابط التفعيل يُستخدم مرة واحدة فقط.</p>
            <Button type="button" onClick={activatePasskey} disabled={Boolean(workingLabel)} className="mt-6 h-13 w-full bg-sky-500 text-base font-black text-white hover:bg-sky-600">
              {workingLabel ? <Loader2 className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5" />}{workingLabel ?? "تفعيل دخولي الخاص"}
            </Button>
          </Card>
        ) : configured ? (
          <Card className="mx-auto max-w-xl border-sky-200 bg-white/94 p-7 text-center shadow-2xl backdrop-blur-xl sm:p-9">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-950 text-white shadow-xl"><Fingerprint className="h-10 w-10" /></span>
            <h2 className="mt-6 text-2xl font-black text-slate-950">دخول المالك بالبصمة</h2>
            <p className="mt-3 leading-7 text-slate-600">ما تحتاج كلمة المالك ولا كلمة الفرع. جهازك يتحقق منك محليًا ثم يفتح لك اختيار الفروع.</p>
            <Button type="button" onClick={loginWithPasskey} disabled={Boolean(workingLabel)} className="mt-6 h-13 w-full bg-sky-500 text-base font-black text-white hover:bg-sky-600">
              {workingLabel ? <Loader2 className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5" />}{workingLabel ?? "فتح بالبصمة"}
            </Button>
          </Card>
        ) : (
          <Card className="mx-auto max-w-xl border-slate-200 bg-white/94 p-7 text-center shadow-2xl">
            <ShieldCheck className="mx-auto h-12 w-12 text-slate-700" />
            <h2 className="mt-4 text-xl font-black text-slate-950">بوابة المالك بانتظار التفعيل</h2>
            <p className="mt-2 leading-7 text-slate-600">افتح رابط التفعيل الخاص من جهازك. لا يوجد دخول عام ولا كلمة مرور لهذه الصفحة.</p>
          </Card>
        )}

        {workingLabel && authenticated && <div className="fixed inset-x-4 bottom-5 z-50 mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 font-bold text-white shadow-2xl"><Loader2 className="h-5 w-5 animate-spin" />{workingLabel}</div>}
      </main>

      <Dialog open={installHelpOpen} onOpenChange={setInstallHelpOpen}>
        <DialogContent className="max-w-md bg-white" dir="rtl">
          <DialogHeader><DialogTitle className="text-xl font-black">ثبّت بوابة التحكم كأيقونة</DialogTitle><DialogDescription>تفتح بعدها مباشرة كأنها تطبيق مستقل، بدون المرور على موقع الزبائن.</DialogDescription></DialogHeader>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <div className="rounded-2xl bg-sky-50 p-4"><Smartphone className="mb-2 h-5 w-5 text-sky-700" /><strong>على iPhone:</strong> افتح الصفحة في Safari، اضغط زر المشاركة، ثم اختر «إضافة إلى الشاشة الرئيسية».</div>
            <div className="rounded-2xl bg-slate-50 p-4"><Download className="mb-2 h-5 w-5 text-slate-700" /><strong>على الكمبيوتر:</strong> من قائمة المتصفح اختر «تثبيت التطبيق» أو «Install app».</div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
