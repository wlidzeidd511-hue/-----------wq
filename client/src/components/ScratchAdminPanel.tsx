import { useEffect, useState } from "react";
import { Gift, Loader2, RefreshCw, Save, Sparkles, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { QuickScratchCampaignBuilder } from "@/components/QuickScratchCampaignBuilder";
import { ScratchPhrasesManager } from "@/components/ScratchPhrasesManager";

type Branch = { id: number; name: string; isActive: boolean };
type Prize = { id: number; name: string; description: string | null; quantity: number; isWinning: boolean; isActive: boolean };

function monthKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

function PrizeEditor({ prize, onSave, onDelete }: { prize: Prize; onSave: (input: { id: number; name: string; description: string | null; quantity: number; isWinning: boolean; isActive: boolean }) => Promise<void>; onDelete: (id: number) => Promise<void> }) {
  const [name, setName] = useState(prize.name);
  const [description, setDescription] = useState(prize.description ?? "");
  const [quantity, setQuantity] = useState(String(prize.quantity));
  const [isWinning, setIsWinning] = useState(prize.isWinning);
  const [isActive, setIsActive] = useState(prize.isActive);
  return <Card className="border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /><strong>{name || "جائزة"}</strong></div><Switch checked={isActive} onCheckedChange={setIsActive} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Input value={name} onChange={event => setName(event.target.value)} placeholder="اسم الجائزة" /><Input type="number" min="0" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="الكمية" /><Textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="وصف أو طريقة الاستلام" className="sm:col-span-2" /></div><label className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm font-bold"><span>{isWinning ? "نتيجة رابحة" : "نتيجة غير رابحة"}</span><Switch checked={isWinning} onCheckedChange={setIsWinning} /></label><div className="mt-4 flex justify-between gap-2"><Button size="sm" onClick={() => onSave({ id: prize.id, name: name.trim(), description: description.trim() || null, quantity: Math.max(0, Number(quantity) || 0), isWinning, isActive })}><Save className="h-4 w-4" />حفظ</Button><Button size="sm" variant="ghost" className="text-red-700" onClick={() => onDelete(prize.id)}><Trash2 className="h-4 w-4" />حذف</Button></div></Card>;
}

export function ScratchAdminPanel({ selectedBranchId, branches }: { selectedBranchId?: number; branches: Branch[] }) {
  const utils = trpc.useUtils();
  const campaigns = trpc.scratch.admin.list.useQuery(selectedBranchId ? { branchId: selectedBranchId } : undefined, { retry: false });
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [createBranchId, setCreateBranchId] = useState(selectedBranchId ? String(selectedBranchId) : "");
  const [createMonth, setCreateMonth] = useState(monthKey());
  const [prizeForm, setPrizeForm] = useState({ name: "", description: "", quantity: "1", isWinning: true });
  const details = trpc.scratch.admin.details.useQuery({ campaignId: selectedCampaignId ?? 1 }, { enabled: selectedCampaignId !== null, retry: false });
  const ensure = trpc.scratch.admin.ensure.useMutation();
  const updateCampaign = trpc.scratch.admin.updateCampaign.useMutation();
  const addPrize = trpc.scratch.admin.addPrize.useMutation();
  const updatePrize = trpc.scratch.admin.updatePrize.useMutation();
  const deletePrize = trpc.scratch.admin.deletePrize.useMutation();
  const generate = trpc.scratch.admin.generate.useMutation();
  const runMonthly = trpc.scratch.admin.runMonthly.useMutation();

  useEffect(() => {
    if (selectedBranchId) setCreateBranchId(String(selectedBranchId));
  }, [selectedBranchId]);

  useEffect(() => {
    if (!selectedCampaignId && campaigns.data?.[0]) setSelectedCampaignId(campaigns.data[0].campaign.id);
  }, [campaigns.data, selectedCampaignId]);

  async function refresh() {
    await Promise.all([utils.scratch.admin.list.invalidate(), utils.scratch.admin.details.invalidate()]);
  }

  async function handleEnsure() {
    if (!createBranchId) return toast.error("اختر الفرع");
    try {
      const campaign = await ensure.mutateAsync({ branchId: Number(createBranchId), monthKey: createMonth, codeCount: 100 });
      setSelectedCampaignId(campaign.id);
      toast.success("تم تجهيز الحملة الشهرية");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء الحملة");
    }
  }

  async function handleAddPrize() {
    if (!selectedCampaignId || !prizeForm.name.trim()) return toast.error("اكتب اسم الجائزة");
    try {
      await addPrize.mutateAsync({ campaignId: selectedCampaignId, name: prizeForm.name.trim(), description: prizeForm.description.trim() || null, quantity: Math.max(0, Number(prizeForm.quantity) || 0), isWinning: prizeForm.isWinning, isActive: true });
      setPrizeForm({ name: "", description: "", quantity: "1", isWinning: true });
      toast.success("تمت إضافة الجائزة");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إضافة الجائزة");
    }
  }

  const selected = details.data;
  return <div className="space-y-6">
    <Card className="border-violet-200 bg-gradient-to-l from-violet-50 to-white p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="flex items-center gap-2 text-violet-700"><Sparkles className="h-5 w-5" /><span className="text-xs font-black">100 كود كل شهر لكل فرع</span></div><h2 className="mt-2 text-2xl font-black text-slate-950">إدارة اكشط واربح</h2><p className="mt-1 text-sm leading-6 text-slate-600">الأكواد عشوائية، تستخدم مرة واحدة، وتبدأ صلاحيتها 72 ساعة عند تسليم الجهاز.</p></div><Button variant="outline" onClick={() => runMonthly.mutateAsync().then(async () => { toast.success("تم تجهيز حملات الشهر لكل الفروع"); await refresh(); }).catch(error => toast.error(error.message))} disabled={runMonthly.isPending} className="bg-white">{runMonthly.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}تشغيل التجهيز الشهري الآن</Button></div></Card>

    <QuickScratchCampaignBuilder selectedBranchId={selectedBranchId} branches={branches} onComplete={async campaignId => { setSelectedCampaignId(campaignId); await refresh(); }} />
    <ScratchPhrasesManager branches={branches.filter(branch => branch.isActive)} />

    <div className="grid gap-4 lg:grid-cols-3">{campaigns.data?.map(row => <button key={row.campaign.id} type="button" onClick={() => setSelectedCampaignId(row.campaign.id)} className={`rounded-2xl border p-4 text-right transition ${selectedCampaignId === row.campaign.id ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white hover:border-violet-200"}`}><div className="flex items-center justify-between gap-2"><strong>{row.branchName} · {row.campaign.monthKey}</strong><Badge variant={row.campaign.status === "active" ? "default" : "secondary"}>{row.campaign.status === "active" ? "نشطة" : row.campaign.status === "draft" ? "مسودة" : "مغلقة"}</Badge></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><span className="rounded-xl bg-white p-2"><b className="block text-lg">{row.stats?.total ?? 0}</b>كود</span><span className="rounded-xl bg-white p-2"><b className="block text-lg">{row.stats?.assigned ?? 0}</b>مسند</span><span className="rounded-xl bg-white p-2"><b className="block text-lg">{row.stats?.redeemed ?? 0}</b>مستخدم</span></div></button>)}</div>

    {selected && <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]"><div className="space-y-5"><Card className="p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black text-violet-700">الحملة المحددة</p><h3 className="mt-1 text-xl font-black">{selected.campaign.monthKey}</h3></div><Select value={selected.campaign.status} onValueChange={status => updateCampaign.mutateAsync({ id: selected.campaign.id, status: status as "draft" | "active" | "closed" }).then(refresh)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">مسودة</SelectItem><SelectItem value="active">نشطة</SelectItem><SelectItem value="closed">مغلقة</SelectItem></SelectContent></Select></div><div className="mt-5 grid grid-cols-2 gap-3 text-center"><div className="rounded-xl bg-slate-50 p-3"><b className="block text-2xl">{selected.stats.total}</b><span className="text-xs">من {selected.campaign.codeCount} كود</span></div><div className="rounded-xl bg-amber-50 p-3"><b className="block text-2xl">{selected.stats.winningSlots}</b><span className="text-xs">خانات رابحة</span></div><div className="rounded-xl bg-sky-50 p-3"><b className="block text-2xl">{selected.stats.assigned}</b><span className="text-xs">مسند للعملاء</span></div><div className="rounded-xl bg-emerald-50 p-3"><b className="block text-2xl">{selected.stats.redeemed}</b><span className="text-xs">تم كشطه</span></div></div><div className="mt-4 grid gap-2"><Button onClick={() => generate.mutateAsync({ campaignId: selected.campaign.id, redistribute: false }).then(async () => { toast.success("تم توليد أو إكمال 100 كود"); await refresh(); }).catch(error => toast.error(error.message))}><Sparkles className="h-4 w-4" />توليد أو إكمال الأكواد</Button><Button variant="outline" onClick={() => generate.mutateAsync({ campaignId: selected.campaign.id, redistribute: true }).then(async () => { toast.success("تم توزيع الجوائز عشوائيًا على الأكواد"); await refresh(); }).catch(error => toast.error(error.message))} disabled={selected.stats.assigned > 0 || selected.stats.redeemed > 0}>إعادة توزيع الجوائز قبل الإسناد</Button></div></Card><Card className="p-5"><h3 className="font-black">إضافة جائزة</h3><div className="mt-4 space-y-3"><Input value={prizeForm.name} onChange={event => setPrizeForm({ ...prizeForm, name: event.target.value })} placeholder="مثال: خصم 20 ريال" /><Input type="number" min="0" value={prizeForm.quantity} onChange={event => setPrizeForm({ ...prizeForm, quantity: event.target.value })} placeholder="عدد الفائزين" /><Textarea value={prizeForm.description} onChange={event => setPrizeForm({ ...prizeForm, description: event.target.value })} placeholder="تفاصيل الجائزة وطريقة الاستلام" /><label className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm font-bold"><span>{prizeForm.isWinning ? "جائزة رابحة" : "نتيجة غير رابحة"}</span><Switch checked={prizeForm.isWinning} onCheckedChange={isWinning => setPrizeForm({ ...prizeForm, isWinning })} /></label><Button onClick={handleAddPrize} disabled={addPrize.isPending} className="w-full"><Gift className="h-4 w-4" />إضافة الجائزة</Button></div></Card></div><div><div className="mb-3"><h3 className="text-xl font-black">جوائز الحملة</h3><p className="text-sm text-slate-500">مجموع الكميات لا يمكن أن يتجاوز {selected.campaign.codeCount} كود.</p></div><div className="grid gap-4 lg:grid-cols-2">{selected.prizes.length ? selected.prizes.map(prize => <PrizeEditor key={prize.id} prize={prize} onSave={async input => { await updatePrize.mutateAsync(input); toast.success("تم حفظ الجائزة"); await refresh(); }} onDelete={async id => { try { await deletePrize.mutateAsync({ id }); toast.success("تم حذف الجائزة"); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف الجائزة"); } }} />) : <Card className="border-dashed p-10 text-center text-slate-500 lg:col-span-2">أضف الجوائز أولًا، ثم أعد توزيعها على الأكواد عشوائيًا.</Card>}</div></div></div>}
  </div>;
}
