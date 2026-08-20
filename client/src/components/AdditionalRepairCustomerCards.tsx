import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

type Proposal = {
  id: number;
  issue: string;
  description: string | null;
  amount: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  respondedAt: number | null;
};

function money(value: number) {
  return `${(value / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

function ProposalCards({ proposals, pendingId, onRespond }: { proposals: Proposal[]; pendingId?: number; onRespond: (id: number, decision: "approved" | "rejected") => void }) {
  if (!proposals.length) return null;
  return <section className="space-y-3">{proposals.map(proposal => <Card key={proposal.id} className={`border-2 p-5 shadow-lg ${proposal.status === "pending" ? "border-orange-200 bg-orange-50/95" : proposal.status === "approved" ? "border-emerald-200 bg-emerald-50/90" : "border-slate-200 bg-white/95"}`}><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white"><AlertTriangle className="h-6 w-6" /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black text-slate-950">اكتشفنا عطلًا إضافيًا: {proposal.issue}</h3><Badge variant="secondary">{proposal.status === "pending" ? "قرارك مطلوب" : proposal.status === "approved" ? "تمت الموافقة" : proposal.status === "rejected" ? "غير موافق" : "ملغي"}</Badge></div>{proposal.description && <p className="mt-2 text-sm leading-6 text-slate-700">{proposal.description}</p>}<p className="mt-2 text-sm text-slate-700">التكلفة الإضافية: <strong className="text-orange-800">{money(proposal.amount)}</strong></p></div></div>{proposal.status === "pending" && <div className="flex shrink-0 gap-3"><Button onClick={() => onRespond(proposal.id, "approved")} disabled={pendingId === proposal.id} className="bg-emerald-600 font-bold text-white hover:bg-emerald-700">{pendingId === proposal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}موافق</Button><Button onClick={() => onRespond(proposal.id, "rejected")} disabled={pendingId === proposal.id} variant="outline" className="border-red-200 bg-white text-red-700 hover:bg-red-50"><X className="h-4 w-4" />غير موافق</Button></div>}</div></Card>)}</section>;
}

export function PublicAdditionalRepairProposals({ token }: { token: string }) {
  const utils = trpc.useUtils();
  const proposals = trpc.proposals.public.list.useQuery({ token }, { retry: false });
  const respond = trpc.proposals.public.respond.useMutation({
    onSuccess: async result => {
      toast.success(result.proposal.status === "approved" ? "تم تسجيل موافقتك وإضافة التكلفة للفاتورة" : "تم تسجيل عدم موافقتك وإبلاغ المحل");
      await Promise.all([utils.proposals.public.list.invalidate({ token }), utils.orders.track.invalidate({ token })]);
    },
    onError: error => toast.error(error.message),
  });
  return <ProposalCards proposals={proposals.data ?? []} pendingId={respond.isPending ? respond.variables?.proposalId : undefined} onRespond={(proposalId, decision) => respond.mutate({ token, proposalId, decision })} />;
}

export function CustomerAdditionalRepairProposals({ orderId }: { orderId: number }) {
  const utils = trpc.useUtils();
  const proposals = trpc.proposals.customer.list.useQuery({ orderId }, { retry: false });
  const respond = trpc.proposals.customer.respond.useMutation({
    onSuccess: async result => {
      toast.success(result.proposal.status === "approved" ? "تم تسجيل موافقتك وإضافة التكلفة للفاتورة" : "تم تسجيل عدم موافقتك وإبلاغ المحل");
      await Promise.all([
        utils.proposals.customer.list.invalidate({ orderId }),
        utils.accounts.customer.order.invalidate({ id: orderId }),
        utils.accounts.customer.orders.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  return <ProposalCards proposals={proposals.data ?? []} pendingId={respond.isPending ? respond.variables?.proposalId : undefined} onRespond={(proposalId, decision) => respond.mutate({ proposalId, decision })} />;
}
