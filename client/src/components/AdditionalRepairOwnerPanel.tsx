import { useState } from "react";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const statusLabels = { pending: "بانتظار العميل", approved: "وافق العميل", rejected: "غير موافق", cancelled: "ملغي" } as const;

function money(value: number) {
  return `${(value / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

export function AdditionalRepairOwnerPanel({ orderId, defaultOpen = false }: { orderId: number; defaultOpen?: boolean }) {
  const utils = trpc.useUtils();
  const proposals = trpc.proposals.owner.list.useQuery({ orderId }, { retry: false });
  const [issue, setIssue] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [isCreating, setIsCreating] = useState(defaultOpen);
  const create = trpc.proposals.owner.create.useMutation({
    onSuccess: async () => {
      toast.success("تم إرسال العطل والمبلغ للعميل للموافقة");
      setIssue("");
      setDescription("");
      setAmount("");
      setIsCreating(false);
      await Promise.all([
        utils.proposals.owner.list.invalidate({ orderId }),
        utils.proposals.owner.pendingSummary.invalidate(),
        utils.orders.getById.invalidate({ id: orderId }),
      ]);
    },
    onError: error => toast.error(error.message),
  });

  const submit = () => {
    const amountInHalalas = Math.round(Number(amount) * 100);
    if (issue.trim().length < 2) return toast.error("اكتب العطل الإضافي");
    if (!Number.isFinite(amountInHalalas) || amountInHalalas <= 0) return toast.error("أدخل مبلغًا صحيحًا");
    create.mutate({ orderId, issue: issue.trim(), description: description.trim() || undefined, amount: amountInHalalas });
  };

  return <Card className="mt-4 border-orange-200 bg-orange-50/70 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white"><AlertTriangle className="h-5 w-5" /></span><div><h3 className="font-black text-slate-950">عطل وتكلفة إضافية</h3><p className="text-xs text-slate-600">السعر لا يتغير إلا بعد موافقة العميل.</p></div></div>
      <Button type="button" variant="outline" className="border-orange-300 bg-white text-orange-900" onClick={() => setIsCreating(value => !value)}>{isCreating ? "إلغاء" : <><Plus className="h-4 w-4" />إضافة عطل إضافي</>}</Button>
    </div>
    {isCreating && <div className="mt-4 rounded-2xl border border-orange-200 bg-white/70 p-3"><div className="grid gap-3 sm:grid-cols-2"><Input value={issue} onChange={event => setIssue(event.target.value)} placeholder="العطل الإضافي: مثال مدخل الشاحن" className="bg-white" /><Input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="المبلغ الإضافي بالريال" className="bg-white" /><Textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="تفاصيل تظهر للعميل قبل الموافقة" className="bg-white sm:col-span-2" /></div><Button type="button" onClick={submit} disabled={create.isPending} className="mt-3 w-full bg-orange-500 font-bold text-white hover:bg-orange-600">{create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}إرسال للعميل للموافقة</Button></div>}
    {proposals.data?.length ? <div className="mt-4 space-y-2">{proposals.data.map(proposal => <div key={proposal.id} className="rounded-xl border border-orange-100 bg-white p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900">{proposal.issue}</p><p className="mt-1 text-xs text-slate-500">{proposal.description || "بدون تفاصيل إضافية"}</p></div><Badge variant="secondary">{statusLabels[proposal.status]}</Badge></div><p className="mt-2 text-sm font-black text-orange-700">{money(proposal.amount)}</p></div>)}</div> : null}
  </Card>;
}
