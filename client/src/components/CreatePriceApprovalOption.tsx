import { Banknote, BellRing, CheckCircle2 } from "lucide-react";

type CreatePriceApprovalOptionProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  price: string;
  customerPhone: string;
  disabled?: boolean;
};

export function CreatePriceApprovalOption({ checked, onChange, price, customerPhone, disabled = false }: CreatePriceApprovalOptionProps) {
  const hasPrice = Number(price) > 0;
  const hasPhone = customerPhone.trim().length >= 9;

  return (
    <section className={`rounded-2xl border p-4 transition ${checked ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-slate-50/70"}`} aria-label="إرسال موافقة السعر">
      <button type="button" disabled={disabled} onClick={() => onChange(!checked)} className="flex w-full items-start gap-3 text-right disabled:cursor-not-allowed disabled:opacity-60" aria-pressed={checked}>
        <span className={`mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${checked ? "bg-orange-500 text-white" : "bg-white text-slate-500"}`}>
          {checked ? <CheckCircle2 className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}
        </span>
        <span className="flex-1">
          <span className="flex flex-wrap items-center gap-2 font-black text-slate-950">
            إرسال موافقة السعر للعميل
            {checked && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">مفعّلة</span>}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-600">بعد إنشاء الطلب تصبح حالته «بانتظار الموافقة»، وتُجهّز رسالة للعميل ويظهر له زرا موافق وغير موافق داخل رابط التتبع.</span>
        </span>
      </button>

      {checked && (
        <div className="mt-3 grid gap-2 border-t border-orange-200 pt-3 text-xs sm:grid-cols-2">
          <p className={`flex items-center gap-2 rounded-lg px-3 py-2 font-bold ${hasPrice ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}><Banknote className="h-4 w-4" />{hasPrice ? `السعر: ${price} ريال` : "أدخل سعرًا أكبر من صفر"}</p>
          <p className={`flex items-center gap-2 rounded-lg px-3 py-2 font-bold ${hasPhone ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}><BellRing className="h-4 w-4" />{hasPhone ? `الجوال: ${customerPhone}` : "أدخل رقم جوال العميل"}</p>
        </div>
      )}
    </section>
  );
}
