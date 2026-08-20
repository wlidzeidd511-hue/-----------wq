import { useEffect, useState } from "react";
import { Link } from "wouter";
import { QrCode, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STORE_APP_ICON_URL } from "@shared/siteConfig";
import { trpc } from "@/lib/trpc";

const WELCOME_SEEN_KEY = "hattef-welcome-seen";

export function WelcomePopup() {
  const [open, setOpen] = useState(false);
  const contentQuery = trpc.content.public.useQuery(undefined, { retry: false, staleTime: 0 });
  const welcomeLines = (contentQuery.data?.site_welcome_message ?? "يا بعد القصيم كله… نورتناااا 🩵\nتطمن… جهازك جهازنا 📱\nكل تحديث على جهازك يوصلك أول بأول… بدون ما تحتاج تسأل أحد 🫶🏻").split("\n").filter(Boolean);

  useEffect(() => {
    if (window.localStorage.getItem(WELCOME_SEEN_KEY)) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
      setOpen(true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, []);

  function close() {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/70 bg-white p-6 text-center shadow-2xl sm:p-9">
        <button type="button" onClick={close} className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="إغلاق الترحيب"><X className="h-5 w-5" /></button>
        <img src={STORE_APP_ICON_URL} alt="الشعار الرسمي لهاتف التميز" className="mx-auto h-20 w-20 rounded-2xl bg-white object-contain shadow-xl shadow-sky-500/20 ring-1 ring-sky-100" />
        <h2 id="welcome-title" className="mt-5 text-3xl font-black leading-[1.45] text-slate-950">{welcomeLines[0] ?? "يا بعد القصيم كله… نورتناااا 🩵"}</h2>
        <p className="mt-3 flex items-center justify-center gap-2 text-xl font-black text-sky-700"><Smartphone className="h-5 w-5" />{welcomeLines[1] ?? "تطمن… جهازك جهازنا 📱"}</p>
        <p className="mx-auto mt-4 max-w-md text-base font-semibold leading-8 text-slate-600">{welcomeLines.slice(2).join(" ") || "كل تحديث على جهازك يوصلك أول بأول… بدون ما تحتاج تسأل أحد 🫶🏻"}</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild onClick={close} className="h-12 bg-sky-500 px-6 font-bold text-white hover:bg-sky-600"><Link href="/track"><QrCode className="h-5 w-5" />تتبّع جهازك</Link></Button>
          <Button type="button" variant="outline" onClick={close} className="h-12 border-sky-200 bg-white px-6 font-bold text-sky-700">كمّل تصفح الموقع</Button>
        </div>
      </div>
    </div>
  );
}
