import { useMemo, useState } from "react";
import { MessageCirclePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PopupMessageEditor, type EditablePopupCategory } from "@/components/PopupMessageEditor";
import { trpc } from "@/lib/trpc";

const scratchCategories: Record<"before_scratch" | "scratch_win" | "scratch_loss", string> = {
  before_scratch: "قبل الكشط",
  scratch_win: "عند الفوز",
  scratch_loss: "عند الخسارة",
};
const allowedCategories = Object.keys(scratchCategories) as EditablePopupCategory[];

export function ScratchPhrasesManager({ branches }: { branches: Array<{ id: number; name: string }> }) {
  const utils = trpc.useUtils();
  const list = trpc.platform.popups.list.useQuery({ includeInactive: true }, { retry: false });
  const create = trpc.platform.popups.create.useMutation();
  const update = trpc.platform.popups.update.useMutation();
  const remove = trpc.platform.popups.delete.useMutation();
  const [form, setForm] = useState({ branchId: "all", category: "before_scratch" as keyof typeof scratchCategories, message: "", weight: "1" });
  const messages = useMemo(() => (list.data ?? []).filter(item => allowedCategories.includes(item.category as EditablePopupCategory)), [list.data]);

  async function refresh() {
    await Promise.all([utils.platform.popups.list.invalidate(), utils.platform.popups.categorySettings.invalidate()]);
  }

  async function addMessage() {
    if (!form.message.trim()) return toast.error("اكتب العبارة أولًا");
    await create.mutateAsync({
      branchId: form.branchId === "all" ? null : Number(form.branchId),
      category: form.category,
      message: form.message.trim(),
      weight: Math.max(1, Math.min(20, Number(form.weight) || 1)),
      isActive: true,
    });
    setForm(current => ({ ...current, message: "", weight: "1" }));
    toast.success("تمت إضافة العبارة");
    await refresh();
  }

  return <section className="space-y-4">
    <Card className="border-sky-200 p-5">
      <div className="flex items-center gap-2"><MessageCirclePlus className="h-5 w-5 text-sky-600" /><h3 className="text-lg font-black">عبارات الكشط القابلة للتعديل</h3></div>
      <p className="mt-1 text-sm leading-6 text-slate-600">أضف أو عدّل أو احذف عبارات قبل الكشط والفوز والخسارة. يختار النظام منها عشوائيًا، ووزن الظهور الأعلى يظهر أكثر.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Select value={form.branchId} onValueChange={value => setForm(current => ({ ...current, branchId: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">جميع الفروع</SelectItem>{branches.map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select>
        <Select value={form.category} onValueChange={value => setForm(current => ({ ...current, category: value as keyof typeof scratchCategories }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(scratchCategories).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
        <Input type="number" min="1" max="20" value={form.weight} onChange={event => setForm(current => ({ ...current, weight: event.target.value }))} placeholder="وزن الظهور" />
        <Textarea value={form.message} onChange={event => setForm(current => ({ ...current, message: event.target.value }))} className="min-h-24 md:col-span-3" placeholder="اكتب العبارة الجديدة" />
      </div>
      <Button type="button" className="mt-3" onClick={addMessage} disabled={create.isPending || !form.message.trim()}><MessageCirclePlus className="h-4 w-4" />إضافة العبارة</Button>
    </Card>
    <div className="grid gap-3 lg:grid-cols-2">
      {messages.map(message => <PopupMessageEditor key={message.id} message={{ ...message, category: message.category as EditablePopupCategory }} branches={branches} allowedCategories={allowedCategories} onSave={async input => { await update.mutateAsync(input); toast.success("تم حفظ العبارة"); await refresh(); }} onDelete={async id => { await remove.mutateAsync({ id }); toast.success("تم حذف العبارة"); await refresh(); }} />)}
    </div>
  </section>;
}
