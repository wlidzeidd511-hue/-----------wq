import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  BadgeCheck,
  Code2,
  MapPin,
  MessageCircle,
  Phone,
  QrCode,
  ShieldCheck,
  Smartphone,
  TimerReset,
  Wrench,
} from "lucide-react";
import { ServiceBackdrop } from "@/components/ServiceBackdrop";
import { ContactFooterPromo } from "@/components/ContactFooterPromo";
import { WelcomePopup } from "@/components/WelcomePopup";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { OWNER_LOGIN_PATH } from "@/ownerPortal";
import { buildWhatsAppUrl, resolveBranchContacts, STORE_LOGO_URL } from "@shared/siteConfig";

const services = [
  {
    icon: Wrench,
    title: "صيانة الأجهزة",
    description: "فحص دقيق وإصلاح احترافي للشاشات والبطاريات والأعطال الداخلية.",
    points: ["فحص وتوثيق حالة الجهاز", "تحديث مباشر لحالة الطلب", "ضمان مسجل في الفاتورة"],
    style: "from-sky-500 to-cyan-400",
  },
  {
    icon: Code2,
    title: "البرمجة والأنظمة",
    description: "معالجة مشاكل النظام والتحديثات وتحسين أداء الأجهزة الذكية.",
    points: ["تحديث واستعادة الأنظمة", "حل المشاكل البرمجية", "تهيئة وتحسين الأداء"],
    style: "from-indigo-500 to-sky-500",
  },
];

export default function Home() {
  const [, navigate] = useLocation();
  const settingsQuery = trpc.settings.public.useQuery();
  const contentQuery = trpc.content.public.useQuery(undefined, { retry: false, staleTime: 0 });
  const branchesQuery = trpc.platform.branches.publicList.useQuery(undefined, { retry: false });
  const settings = settingsQuery.data;
  const content = contentQuery.data ?? {};
  const branchContacts = resolveBranchContacts(branchesQuery.data);
  const developerPhone = content.site_footer_contact_phone ?? "0566515352";
  const developerWhatsapp = `https://wa.me/${developerPhone.replace(/\D/g, "").replace(/^0/, "966")}?text=%D9%85%D8%B1%D8%AD%D8%A8%D9%8B%D8%A7%20%D9%88%D9%84%D9%8A%D8%AF%D8%8C%20%D8%A3%D8%B1%D8%BA%D8%A8%20%D8%A8%D8%A7%D9%84%D8%AA%D9%88%D8%A7%D8%B5%D9%84%20%D8%A8%D8%AE%D8%B5%D9%88%D8%B5%20%D8%A7%D9%84%D8%A8%D8%B1%D9%85%D8%AC%D8%A9`;

  return (
    <div className="page-background min-h-screen" dir="rtl">
      <WelcomePopup />
      <ServiceBackdrop />
      <div className="page-content relative z-10">
        <header className="sticky top-0 z-40 border-b border-white/75 bg-white/82 shadow-sm backdrop-blur-xl">
          <div className="container flex min-h-24 items-center justify-between gap-3 py-2 sm:min-h-28">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <img src={STORE_LOGO_URL} alt="الشعار الرسمي لهاتف التميز للاتصالات" className="h-20 w-28 shrink-0 object-contain drop-shadow-md sm:h-24 sm:w-36" />
            </Link>
            <nav className="flex items-center gap-2">
              <Link href={OWNER_LOGIN_PATH} aria-label="دخول المالك" title="دخول المالك" className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2">
                <ShieldCheck className="h-5 w-5" />
              </Link>
              <Link href="/contact" className="hidden h-10 items-center rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 sm:inline-flex">اتصل بنا</Link>
              <Link href="/track" className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-50 px-3 text-sm font-bold text-sky-700 hover:bg-sky-100 sm:px-4">
                <QrCode className="h-4 w-4" /><span className="hidden sm:inline">تتبّع طلبك</span>
              </Link>
            </nav>
          </div>
        </header>

        <main>
          <section className="container grid min-h-[650px] items-center gap-12 py-14 lg:grid-cols-[1.08fr_0.92fr] lg:py-20">
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/52 px-4 py-2 text-xs font-bold text-sky-800 shadow-sm backdrop-blur-xl">
                <BadgeCheck className="h-4 w-4" />صيانة وبرمجة بتوثيق واضح
              </div>
              <h1 className="text-4xl font-black leading-[1.25] text-slate-950 sm:text-5xl lg:text-6xl">
                جهازك في أيدٍ خبيرة،
                <span className="mt-2 block text-sky-500">{content.site_tagline ?? "كل جديد على جهازك… قدام عينك، أول بأول ✔️🩵"}</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                نقدم خدمات الصيانة والبرمجة للأجهزة الذكية، مع تتبّع آمن للطلب وموافقة إلكترونية على السعر وفاتورة وضمان واضحين.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <Button onClick={() => navigate("/track")} size="lg" className="h-13 bg-sky-500 px-7 font-bold text-white shadow-xl shadow-sky-500/20 hover:bg-sky-600 sm:col-span-2">
                  <QrCode className="h-5 w-5" />تتبّع طلبك<ArrowLeft className="h-4 w-4" />
                </Button>
                {branchContacts.map(contact => (
                  <a key={contact.code} href={buildWhatsAppUrl(`السلام عليكم، أبي أتواصل مع ${contact.name}`, contact.whatsappPhone)} target="_blank" rel="noreferrer" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border border-white/80 bg-white/52 px-4 py-3 text-center text-sm font-bold text-emerald-800 shadow-sm backdrop-blur-xl hover:bg-white/68">
                    <MessageCircle className="h-5 w-5 shrink-0" />تواصل معنا {contact.name}
                  </a>
                ))}
              </div>
              <div className="mt-9 grid max-w-xl grid-cols-3 gap-3 text-center">
                {[{ icon: ShieldCheck, label: "ضمان مسجل" }, { icon: TimerReset, label: "تحديثات مستمرة" }, { icon: QrCode, label: "تتبّع آمن" }].map(item => (
                  <div key={item.label} className="rounded-2xl border border-white/75 bg-white/44 px-2 py-4 shadow-sm backdrop-blur-xl">
                    <item.icon className="mx-auto mb-2 h-5 w-5 text-sky-600" /><span className="text-xs font-bold text-slate-700">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg">
              <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-sky-400/25 to-cyan-300/10 blur-2xl" />
              <Card className="overflow-hidden border border-white/75 bg-white/40 shadow-2xl shadow-sky-900/15 backdrop-blur-2xl">
                <div className="bg-gradient-to-l from-sky-500 to-cyan-400 p-6 text-white">
                  <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-sky-100">رحلة طلبك</p><h2 className="mt-1 text-2xl font-black">واضحة من الاستلام للتسليم</h2></div><Smartphone className="h-10 w-10 text-white/90" /></div>
                </div>
                <div className="space-y-0 p-6 sm:p-7">
                  {[
                    ["01", "استلام وتوثيق الجهاز", "تسجيل الحالة والملحقات والصور"],
                    ["02", "الفحص واعتماد السعر", "تظهر لك التكلفة للموافقة قبل بدء العمل"],
                    ["03", "التنفيذ والتحديث", "تتابع حالة الجهاز من رابطك الآمن"],
                    ["04", "الاستلام والضمان", "فاتورة إلكترونية وضمان محفوظ"],
                  ].map((step, index) => (
                    <div key={step[0]} className="relative flex gap-4 pb-6 last:pb-0">
                      {index < 3 && <span className="absolute right-5 top-10 h-[calc(100%-0.5rem)] w-px bg-sky-200" />}
                      <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-xs font-black text-sky-700 ring-1 ring-sky-200">{step[0]}</span>
                      <div><h3 className="font-black text-slate-950">{step[1]}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{step[2]}</p></div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </section>

          <section className="container pb-16 sm:pb-24">
            <div className="mb-8 max-w-2xl"><p className="text-sm font-bold text-sky-600">خدماتنا</p><h2 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">حلول عملية لجهازك</h2><p className="mt-3 leading-7 text-slate-600">نهتم بالتشخيص الصحيح، توثيق العمل، وإبقائك على اطلاع حتى الاستلام.</p></div>
            <div className="grid gap-6 lg:grid-cols-2">
              {services.map(service => (
                <Card key={service.title} className="group overflow-hidden border border-white/75 bg-white/34 p-6 shadow-xl shadow-sky-900/5 backdrop-blur-2xl sm:p-8">
                  <div className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${service.style} text-white shadow-lg transition-transform duration-200 group-hover:-translate-y-1`}><service.icon className="h-8 w-8" /></div>
                  <h3 className="text-2xl font-black text-slate-950">{service.title}</h3><p className="mt-3 leading-7 text-slate-600">{service.description}</p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-3">{service.points.map(point => <li key={point} className="flex items-start gap-2 rounded-xl border border-white/60 bg-white/26 p-3 text-sm font-semibold text-slate-800 backdrop-blur-lg"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" />{point}</li>)}</ul>
                </Card>
              ))}
            </div>
          </section>
        </main>

        <ContactFooterPromo />

        <footer className="relative overflow-hidden border-t border-sky-100 bg-white/46 text-slate-800 backdrop-blur-sm">
          <div className="container relative z-10 grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-3 lg:py-14">
            <div>
              <img src={STORE_LOGO_URL} alt="الشعار الرسمي لهاتف التميز للاتصالات" className="h-24 w-36 max-w-full object-contain object-right drop-shadow-md sm:h-28 sm:w-44" />
              <p className="mt-4 max-w-sm text-sm font-medium leading-7 text-slate-600">صيانة وبرمجة الأجهزة الذكية مع تتبّع آمن وفاتورة وضمان إلكتروني.</p>
            </div>

            <div className="rounded-3xl border border-white/75 bg-white/38 p-5 shadow-lg shadow-sky-900/5 backdrop-blur-xl">
              <h3 className="text-lg font-black text-slate-900">روابط سريعة</h3>
              <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-slate-600">
                <Link href="/track" className="transition-colors hover:text-sky-700">تتبّع الطلب</Link>
                <Link href="/contact" className="transition-colors hover:text-sky-700">اتصل بنا والفروع</Link>
                {branchContacts.map(contact => <a key={`wa-${contact.code}`} href={buildWhatsAppUrl(`السلام عليكم، أبي أتواصل مع ${contact.name}`, contact.whatsappPhone)} target="_blank" rel="noreferrer" className="transition-colors hover:text-emerald-700">واتساب {contact.name}</a>)}
              </div>
            </div>

            <div className="rounded-3xl border border-white/75 bg-white/38 p-5 shadow-lg shadow-sky-900/5 backdrop-blur-xl sm:col-span-2 lg:col-span-1">
              <h3 className="text-lg font-black text-slate-900">التواصل والمواقع</h3>
              <div className="mt-4 space-y-3 text-sm font-semibold text-slate-600">
                {branchContacts.map(contact => <div key={`contact-${contact.code}`} className="space-y-2 rounded-2xl border border-white/70 bg-white/32 p-3 backdrop-blur-lg"><a href={buildWhatsAppUrl(`السلام عليكم، أبي أتواصل مع ${contact.name}`, contact.whatsappPhone)} target="_blank" rel="noreferrer" className="flex flex-wrap items-center gap-2 transition-colors hover:text-emerald-700"><MessageCircle className="h-4 w-4 text-emerald-600" /><span>{contact.name}</span><span dir="ltr">{contact.whatsappPhone}</span></a><a href={contact.mapUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 transition-colors hover:text-sky-700"><MapPin className="h-4 w-4 text-sky-600" />موقع {contact.name} على Google Maps</a></div>)}
              </div>
            </div>
          </div>

          <div className="relative z-10 border-t border-sky-200/60 bg-white/35 py-4 text-center text-xs font-bold text-slate-500 backdrop-blur-sm">© 2026 {content.site_title ?? settings?.shopName ?? "هاتف التميز"}.</div>

          <div className="relative z-10 border-t border-sky-200/70 bg-white/55 py-6 backdrop-blur-md">
            <div className="container flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex items-center gap-2.5">
                <img src="/manus-storage/programmer-with-device_374889f6.png" alt="واحد يبرمج" className="h-8 w-8 rounded-lg shadow-md shadow-sky-500/15" />
                <p className="text-xs font-bold leading-relaxed text-slate-600 sm:text-sm">{content.site_footer_rights ?? "جميع الحقوق محفوظة لدى وليد الزلفاوي"}</p>
              </div>
              <a href={developerWhatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100/80 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-200"><MessageCircle className="h-3 w-3" /><span dir="ltr">{developerPhone}</span></a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
