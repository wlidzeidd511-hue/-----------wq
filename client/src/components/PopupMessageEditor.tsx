import { useState } from "react";
import { Edit3, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const popupCategoryLabels = {
  in_repair: "أثناء الصيانة",
  ready: "صار جاهز",
  before_rating: "قبل التقييم",
  after_delivery: "بعد التسليم",
  before_scratch: "قبل الكشط",
  scratch_win: "فاز بالكشط",
  scratch_loss: "خسر بالكشط",
} as const;

export type EditablePopupCategory = keyof typeof popupCategoryLabels;

export function PopupMessageEditor({
  message,
  branches,
  onSave,
  onDelete,
  allowedCategories,
}: {
  message: { id: number; branchId: number | null; category: EditablePopupCategory; message: string; weight: number; isActive: boolean };
  branches: Array<{ id: number; name: string }>;
  onSave: (input: { id: number; branchId: number | null; category: EditablePopupCategory; message: string; weight: number; isActive: boolean }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  allowedCategories?: EditablePopupCategory[];
}) {
  const [branchId, setBranchId] = useState(message.branchId ? String(message.branchId) : "all");
  const [category, setCategory] = useState<EditablePopupCategory>(message.category);
  const [text, setText] = useState(message.message);
  const [weight, setWeight] = useState(String(message.weight));
  const [isActive, setIsActive] = useState(message.isActive);

  const categories = Object.entries(popupCategoryLabels).filter(([key]) => !allowedCategories || allowedCategories.includes(key as EditablePopupCategory));
  return <Card className="p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Edit3 className="h-4 w-4 text-sky-600" /><h3 className="font-black">تحرير الرسالة</h3></div><Switch checked={isActive} onCheckedChange={setIsActive} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="space-y-2"><span className="block text-sm font-bold text-slate-700">الفرع</span><Select value={branchId} onValueChange={setBranchId}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">جميع الفروع</SelectItem>{branches.map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select></label><label className="space-y-2"><span className="block text-sm font-bold text-slate-700">المرحلة</span><Select value={category} onValueChange={value => setCategory(value as EditablePopupCategory)}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent>{categories.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></label><label className="space-y-2"><span className="block text-sm font-bold text-slate-700">وزن الظهور</span><Input type="number" min="1" max="20" value={weight} onChange={event => setWeight(event.target.value)} className="bg-white" /></label><div className="flex items-end"><Badge variant={isActive ? "default" : "secondary"}>{isActive ? "مفعّلة" : "متوقفة"}</Badge></div><label className="space-y-2 sm:col-span-2"><span className="block text-sm font-bold text-slate-700">نص الرسالة</span><Textarea value={text} onChange={event => setText(event.target.value)} className="min-h-24 bg-white" /></label></div><div className="mt-4 flex justify-between gap-2"><Button size="sm" onClick={() => onSave({ id: message.id, branchId: branchId === "all" ? null : Number(branchId), category, message: text.trim(), weight: Math.max(1, Number(weight) || 1), isActive })} disabled={!text.trim()}><Save className="h-4 w-4" />حفظ التعديلات</Button><Button size="sm" variant="ghost" className="text-red-700" onClick={() => onDelete(message.id)}><Trash2 className="h-4 w-4" />حذف</Button></div></Card>;
}
