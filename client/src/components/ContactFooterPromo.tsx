import { ExternalLink, MapPin, MessageCircle, QrCode } from "lucide-react";
import {
  buildWhatsAppUrl,
  PUBLIC_SITE_URL,
  resolveBranchContacts,
} from "@shared/siteConfig";
import { trpc } from "@/lib/trpc";

const TABBY_LOGO = "/manus-storage/tabby-logo_663be131.svg";
const TAMARA_LOGO = "/manus-storage/tamara-logo_2fa3aa76.png";
const SITE_QR = "/manus-storage/hatfaltmyez-qr_55b76d3a.svg";

export function ContactFooterPromo() {
  const branchesQuery = trpc.platform.branches.publicList.useQuery(undefined, { retry: false });
  const contentQuery = trpc.content.public.useQuery(undefined, { retry: false, staleTime: 0 });
  const branchContacts = resolveBranchContacts(branchesQuery.data);

  return (
    <section className="relative overflow-hidden border-y border-sky-200/70 bg-white/34 py-14 backdrop-blur-sm sm:py-20" dir="rtl">
      <div className="absolute -right-24 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-sky-300/20 blur-3xl" />
      <div className="absolute -left-24 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="container relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-3xl font-black leading-[1.45] text-slate-950 sm:text-5xl">
            رحلة جهازك واضحة… من أول دقيقة إلى لحظة التسليم. 🩵
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            {contentQuery.data?.site_footer_services_count ?? "خدمنا أكثر من 7 آلاف جهاز صيانة بنجاح ومستمرّين 📱🩵"}
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-5 lg:grid-cols-2">
          {branchContacts.map(contact => (
            <article key={contact.code} className="rounded-3xl border border-white/72 bg-white/32 p-5 shadow-xl shadow-sky-900/5 backdrop-blur-2xl">
              <div className="mb-4 flex items-center justify-between gap-3"><div className="text-right"><p className="text-xs font-bold text-sky-600">تواصل وزُر الفرع</p><h3 className="mt-1 text-xl font-black text-slate-950">{contact.name}</h3></div><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600"><MapPin className="h-6 w-6" /></span></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <a href={buildWhatsAppUrl(`السلام عليكم، أبي أتواصل مع ${contact.name}`, contact.whatsappPhone)} target="_blank" rel="noreferrer" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-center font-black text-white shadow-lg shadow-emerald-500/15 transition hover:bg-emerald-600" aria-label={`التواصل مع ${contact.name} عبر واتساب على الرقم ${contact.whatsappPhone}`}><MessageCircle className="h-5 w-5 shrink-0" /><span>واتساب<br /><b dir="ltr">{contact.whatsappPhone}</b></span></a>
                <a href={contact.mapUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-sky-200/80 bg-sky-50/55 px-4 py-3 text-center font-black text-sky-800 backdrop-blur-lg transition hover:bg-sky-100/70"><MapPin className="h-5 w-5 shrink-0" />Google Maps</a>
              </div>
            </article>
          ))}

          <a
            href={PUBLIC_SITE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-40 items-center justify-center gap-4 rounded-3xl border border-white/72 bg-white/30 p-5 text-right shadow-xl shadow-sky-900/5 backdrop-blur-2xl transition duration-200 hover:-translate-y-1"
          >
            <img src={SITE_QR} alt={`QR Code لموقع ${PUBLIC_SITE_URL}`} className="h-28 w-28 rounded-xl bg-white/78 p-1 backdrop-blur-sm" />
            <span>
              <span className="flex items-center gap-2 text-xs font-bold text-sky-600"><QrCode className="h-4 w-4" />رابط الموقع</span>
              <strong className="mt-2 block text-base font-black text-slate-950">امسح للدخول</strong>
              <small className="mt-1 flex items-center gap-1 text-slate-500" dir="ltr">hatfaltmyez.com <ExternalLink className="h-3.5 w-3.5" /></small>
            </span>
          </a>

          <div className="flex min-h-40 flex-col items-center justify-center rounded-3xl border border-white/72 bg-white/30 p-6 shadow-xl shadow-sky-900/5 backdrop-blur-2xl">
            <p className="mb-5 text-sm font-black text-slate-700">خيارات الدفع</p>
            <div className="flex w-full items-center justify-center gap-4">
              <span className="flex h-16 min-w-32 items-center justify-center rounded-2xl bg-[#3CF2A5] px-5">
                <img src={TABBY_LOGO} alt="تابي" className="max-h-10 max-w-28 object-contain" />
              </span>
              <span className="flex h-16 min-w-32 items-center justify-center rounded-2xl bg-gradient-to-r from-[#8ed8ff] via-[#f3a8b7] to-[#f7d154] px-5 shadow-sm">
                <img src={TAMARA_LOGO} alt="تمارا" className="max-h-10 max-w-28 object-contain" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
