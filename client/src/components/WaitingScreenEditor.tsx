import { useEffect, useState } from "react";
import { ExternalLink, Loader2, MonitorPlay, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export function WaitingScreenEditor({ branchId, slug }: { branchId: number; slug: string }) {
  const utils = trpc.useUtils();
  const query = trpc.platform.content.waitingOwner.useQuery({ branchId }, { retry: false });
  const [form, setForm] = useState({ title: "", body: "", isActive: true });
  useEffect(() => {
    if (!query.data?.content) return;
    setForm({ title: query.data.content.title ?? "", body: query.data.content.body, isActive: query.data.content.isActive });
  }, [query.data]);
  const update = trpc.platform.content.updateWaiting.useMutation({
    onSuccess: async () => {
      toast.success("تم حفظ شاشة الانتظار");
      await utils.platform.content.waitingOwner.invalidate({ branchId });
    },
    onError: error => toast.error(error.message),
  });
  return <Card className="border-sky-200 bg-sky-50/70 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500 text-white"><MonitorPlay className="h-5 w-5" /></span><div><p className="text-xs font-bold text-sky-700">محتوى قابل للتعديل</p><h2 className="text-xl font-black text-slate-950">شاشة انتظار الفرع</h2></div></div><a href={`/waiting/${slug}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 text-sm font-bold text-sky-700"><ExternalLink className="h-4 w-4" />معاينة الشاشة</a></div>{query.isLoading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />جاري تحميل المحتوى...</div> : <div className="mt-5 grid gap-4"><label className="space-y-2"><span className="text-sm font-bold text-slate-700">العنوان الكبير</span><Input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className="bg-white" /></label><label className="space-y-2"><span className="text-sm font-bold text-slate-700">رسالة الانتظار</span><Textarea rows={4} value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} className="bg-white" /></label><div className="flex items-center justify-between rounded-xl border border-sky-200 bg-white p-4"><div><p className="font-bold text-slate-900">إظهار المحتوى</p><p className="text-xs text-slate-500">يمكن إيقاف الرسالة مؤقتًا مع بقاء البيانات محفوظة.</p></div><Switch checked={form.isActive} onCheckedChange={isActive => setForm({ ...form, isActive })} /></div><Button onClick={() => update.mutate({ branchId, ...form })} disabled={update.isPending || form.title.trim().length < 2 || form.body.trim().length < 2} className="bg-sky-500 font-bold text-white hover:bg-sky-600">{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ شاشة الانتظار</Button></div>}</Card>;
}
