import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatWarrantyYears } from "@/lib/serviceUnits";
import { STORE_LOGO_URL } from "@shared/siteConfig";

export default function InvoicePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t") || "";

  const invoiceQuery = trpc.public.orders.getByToken.useQuery(
    { token },
    { enabled: Boolean(token), retry: false }
  );

  useEffect(() => {
    // فتح نافذة الطباعة تلقائياً بعد تحميل البيانات
    if (invoiceQuery.data?.order) {
      const timer = setTimeout(() => {
        window.print();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [invoiceQuery.data]);

  if (invoiceQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  const order = invoiceQuery.data?.order;

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4" dir="rtl">
        <Card className="max-w-md p-6 text-center shadow-lg">
          <h1 className="text-xl font-black text-red-600">رابط الفاتورة غير صحيح</h1>
          <p className="mt-2 text-sm text-slate-500">تأكد من الرابط أو اطلب الفاتورة مجدداً من الموظف.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0" dir="rtl">
      {/* زر الطباعة اليدوي (يختفي أثناء الطباعة) */}
      <div className="mx-auto mb-4 max-w-xl text-left print:hidden">
        <Button onClick={() => window.print()} className="bg-slate-900 font-bold text-white hover:bg-slate-800">
          <Printer className="ml-2 h-4 w-4" />
          طباعة الفاتورة
        </Button>
      </div>

      {/* جسم الفاتورة المطبوعة */}
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6 shadow-sm print:max-w-full print:rounded-none print:border-none print:shadow-none">
        
        {/* الترويسة الشعار واسم المحل */}
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">هاتف التميز للاتصالات</h1>
            <p className="text-xs font-bold text-slate-500">فاتورة استلام / صيانة</p>
            <p className="mt-1 text-xs text-slate-400">التاريخ: {new Date(order.createdAt).toLocaleDateString("ar-SA")}</p>
          </div>
          <img src={STORE_LOGO_URL} alt="الشعار" className="h-16 w-24 object-contain" />
        </div>

        {/* رقم الفاتورة والباركود */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3">
          <div>
            <span className="text-xs font-bold text-slate-500">رقم الفاتورة</span>
            <p className="text-lg font-black text-sky-700">#{order.barcode}</p>
          </div>
          <div className="text-left">
            <span className="text-xs font-bold text-slate-500">نوع الخدمة</span>
            <p className="text-sm font-bold text-slate-800">{order.serviceType === "maintenance" ? "صيانة عتاد" : "برمجة"}</p>
          </div>
        </div>

        {/* بيانات العميل والجهاز */}
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between border-b py-1">
            <span className="font-bold text-slate-500">اسم العميل:</span>
            <span className="font-black text-slate-900">{order.customerName || "غير محدد"}</span>
          </div>
          <div className="flex justify-between border-b py-1">
            <span className="font-bold text-slate-500">رقم الجوال:</span>
            <span className="font-bold text-slate-800" dir="ltr">{order.customerPhone || "—"}</span>
          </div>
          <div className="flex justify-between border-b py-1">
            <span className="font-bold text-slate-500">الجهاز:</span>
            <span className="font-black text-slate-900">{order.deviceInfo}</span>
          </div>
          {order.serialNumber && (
            <div className="flex justify-between border-b py-1">
              <span className="font-bold text-slate-500">الرقم التسلسلي (IMEI):</span>
              <span className="font-mono text-xs font-bold text-slate-700" dir="ltr">{order.serialNumber}</span>
            </div>
          )}
          {order.reportedIssue && (
            <div className="flex justify-between border-b py-1">
              <span className="font-bold text-slate-500">العطل المشتكى منه:</span>
              <span className="font-bold text-slate-800">{order.reportedIssue}</span>
            </div>
          )}
          {order.receivedAccessories && (
            <div className="flex justify-between border-b py-1">
              <span className="font-bold text-slate-500">الملحقات المستلمة:</span>
              <span className="font-bold text-slate-800">{order.receivedAccessories}</span>
            </div>
          )}
          <div className="flex justify-between border-b py-1">
            <span className="font-bold text-slate-500">مدة الضمان:</span>
            <span className="font-bold text-slate-800">{formatWarrantyYears(order.warrantyDays)}</span>
          </div>
        </div>

        {/* الحسابات والمالية */}
        <div className="mt-6 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>الإجمالي:</span>
            <span className="font-bold">{(order.price / 100).toFixed(2)} ر.س</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>المدفوع مقدمًا:</span>
            <span className="font-bold">{(order.amountPaid / 100).toFixed(2)} ر.س</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-black text-slate-900">
            <span>المتبقي للدفـع:</span>
            <span className="text-emerald-700">{((order.price - order.amountPaid) / 100).toFixed(2)} ر.س</span>
          </div>
        </div>

        {/* الملاحظات إن وجدت */}
        {order.customerVisibleNotes && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs font-bold text-amber-900">
            ملاحظة: {order.customerVisibleNotes}
          </div>
        )}

        {/* شروط الفاتورة المطلوبة */}
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-4 text-xs font-bold text-slate-700">
          <p className="mb-2 font-black text-slate-900 text-sm">الشروط والأحكام:</p>
          <ul className="list-disc space-y-1.5 pr-4 text-slate-800">
            <li>المحل غير مسؤول عن أي أعطال سابقة للجهاز.</li>
            <li>المحل غير مسؤول عن أي جهاز يتأخر صاحبه عن استلامه بعد 30 يوماً من تاريخ الإشعار.</li>
          </ul>
        </div>

        {/* التوقيع والتذييل */}
        <div className="mt-8 flex items-end justify-between text-center text-xs text-slate-500">
          <div>
            <p className="mb-6 font-bold">توقيع العميل:</p>
            <p>.......................................</p>
          </div>
          <div>
            <p className="mb-6 font-bold">ختم / توقيع المحل:</p>
            <p>.......................................</p>
          </div>
        </div>

      </div>
    </div>
  );
}
