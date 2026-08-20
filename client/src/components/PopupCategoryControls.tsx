import { MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";

const categories = {
  in_repair: "أثناء الصيانة",
  ready: "صار جاهز",
  before_rating: "قبل التقييم",
  after_delivery: "بعد التسليم",
  before_scratch: "قبل الكشط",
  scratch_win: "فاز بالكشط",
  scratch_loss: "خسر بالكشط",
} as const;

type Category = keyof typeof categories;

export function PopupCategoryControls({ branchId }: { branchId?: number }) {
  const utils = trpc.useUtils();
  const settings = trpc.platform.popups.categorySettings.useQuery(undefined, { retry: false });
  const update = trpc.platform.popups.setCategoryState.useMutation();

  async function setState(category: Category, isActive: boolean) {
    try {
      await update.mutateAsync({ branchId: branchId ?? null, category, isActive });
      await utils.platform.popups.categorySettings.invalidate();
      toast.success(isActive ? "تم تفعيل فئة الرسائل" : "تم تعطيل فئة الرسائل");
    } catch {
      toast.error("تعذر تحديث حالة الفئة");
    }
  }

  return <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sky-700"><MessageSquareText className="h-5 w-5" /><span className="text-xs font-black">تحكم كامل بالفئات</span></div><h2 className="mt-1 text-xl font-black">{branchId ? "فئات رسائل الفرع" : "فئات الرسائل لجميع الفروع"}</h2><p className="mt-1 text-sm text-slate-500">عند تعطيل الفئة لن يختار النظام أي رسالة منها عشوائيًا. التعطيل العام يسري على كل الفروع.</p></div><Badge variant="outline">{branchId ? `فرع #${branchId}` : "إعداد عام"}</Badge></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(categories).map(([category, label]) => {
    const global = settings.data?.find(row => row.branchId === null && row.category === category);
    const local = branchId ? settings.data?.find(row => row.branchId === branchId && row.category === category) : undefined;
    const globalActive = global?.isActive ?? true;
    const checked = branchId ? globalActive && (local?.isActive ?? true) : globalActive;
    return <label key={category} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4"><span><strong className="block text-sm">{label}</strong>{branchId && !globalActive && <small className="text-xs text-amber-700">معطلة من الإعداد العام</small>}</span><Switch checked={checked} disabled={Boolean(branchId && !globalActive) || update.isPending} onCheckedChange={value => setState(category as Category, value)} /></label>;
  })}</div></Card>;
}
