import { useEffect, useMemo, useState } from "react";
import { Gift, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type Branch = { id: number; name: string; isActive: boolean };
type DraftPrize = { key: number; name: string; description: string; quantity: string };

function monthKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

function freshPrize(key: number): DraftPrize {
  return { key, name: "", description: "", quantity: "10" };
}

export function QuickScratchCampaignBuilder({
  selectedBranchId,
  branches,
  onComplete,
}: {
  selectedBranchId?: number;
  branches: Branch[];
  onComplete: (campaignId: number) => Promise<void>;
}) {
  const [branchId, setBranchId] = useState(selectedBranchId ? String(selectedBranchId) : "");
  const [month, setMonth] = useState(monthKey());
  const [nextKey, setNextKey] = useState(4);
  const [prizes, setPrizes] = useState<DraftPrize[]>([
    { ...freshPrize(1), name: "ستيكر" },
    { ...freshPrize(2), name: "تنظيف" },
    { ...freshPrize(3), name: "خصم" },
  ]);
  const configure = trpc.scratch.admin.configureAndGenerate.useMutation();

  useEffect(() => {
    if (selectedBranchId) setBranchId(String(selectedBranchId));
  }, [selectedBranchId]);

  const winningCount = useMemo(() => prizes.reduce((sum, prize) => sum + Math.max(0, Number(prize.quantity) || 0), 0), [prizes]);
  const losingCount = Math.max(0, 100 - winningCount);

  function updatePrize(key: number, field: keyof Omit<DraftPrize, "key">, value: string) {
    setPrizes(current => current.map(prize => prize.key === key ? { ...prize, [field]: value } : prize));
  }

  async function submit() {
    if (!branchId) return toast.error("اختر الفرع أولًا");
    const configuredPrizes = prizes
      .map(prize => ({ name: prize.name.trim(), description: prize.description.trim() || null, quantity: Math.max(0, Number(prize.quantity) || 0) }))
      .filter(prize => prize.name && prize.quantity > 0);
    if (!configuredPrizes.length) return toast.error("أضف جائزة واحدة على الأقل");
    if (winningCount > 100) return toast.error("مجموع الجوائز أكبر من 100؛ خفّض الكميات");
    try {
      const result = await configure.mutateAsync({ branchId: Number(branchId), monthKey: month, prizes: configuredPrizes });
      if (!result) throw new Error("تعذر تجهيز الحملة");
      toast.success(`تم توليد 100 كود: ${winningCount} رابح و${losingCount} حظ أوفر`);
      await onComplete(result.campaign.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز حملة الكشط");
    }
  }

  return <Card className="overflow-hidden border-violet-200 shadow-sm">
    <div className="bg-gradient-to-l from-violet-100 via-sky-50 to-white p-5">
      <div className="flex items-center gap-2 text-violet-800"><Gift className="h-5 w-5" /><h3 className="text-lg font-black">أنشئ 100 كود بضغطة واحدة</h3></div>
      <p className="mt-1 text-sm leading-6 text-slate-600">اختر الفرع، اكتب الجوائز وكمياتها، والباقي يصير «حظ أوفر» تلقائيًا. توزيع الجوائز عشوائي وآمن.</p>
    </div>
    <div className="space-y-5 p-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Select value={branchId} onValueChange={setBranchId}><SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger><SelectContent>{branches.filter(branch => branch.isActive).map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select>
        <Input type="month" value={month} onChange={event => setMonth(event.target.value)} dir="ltr" aria-label="شهر الحملة" />
      </div>

      <div className="space-y-3">
        {prizes.map((prize, index) => <div key={prize.key} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <div className="mb-3 flex items-center justify-between"><strong>الجائزة {index + 1}</strong><Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => setPrizes(current => current.filter(item => item.key !== prize.key))} disabled={prizes.length === 1} aria-label="حذف الجائزة"><Trash2 className="h-4 w-4" /></Button></div>
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Input value={prize.name} onChange={event => updatePrize(prize.key, "name", event.target.value)} placeholder="اسم الجائزة: ستيكر أو تنظيف أو خصم" />
            <Input type="number" min="1" max="100" inputMode="numeric" value={prize.quantity} onChange={event => updatePrize(prize.key, "quantity", event.target.value)} placeholder="الكمية" />
            <Textarea value={prize.description} onChange={event => updatePrize(prize.key, "description", event.target.value)} placeholder="وصف اختياري أو قيمة الخصم" className="sm:col-span-2" />
          </div>
        </div>)}
      </div>

      <Button type="button" variant="outline" className="w-full" onClick={() => { setPrizes(current => [...current, freshPrize(nextKey)]); setNextKey(value => value + 1); }}><Plus className="h-4 w-4" />إضافة جائزة أخرى</Button>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-sky-50 p-3"><b className="block text-2xl">100</b><span className="text-xs">كل الأكواد</span></div>
        <div className={`rounded-2xl p-3 ${winningCount > 100 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}><b className="block text-2xl">{winningCount}</b><span className="text-xs">رابحة</span></div>
        <div className="rounded-2xl bg-amber-50 text-amber-900 p-3"><b className="block text-2xl">{losingCount}</b><span className="text-xs">حظ أوفر</span></div>
      </div>

      <Button type="button" className="w-full bg-violet-600 hover:bg-violet-700" onClick={submit} disabled={configure.isPending || winningCount > 100}>{configure.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}إنشاء وتوزيع 100 كود الآن</Button>
    </div>
  </Card>;
}
