import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, HeartHandshake, MessageCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type RatingContext = {
  eligible: boolean;
  order: { id: number; barcode: string; branchId: number; status: string };
  branch: { id: number; name: string; reviewUrl: string | null };
  rating: { id: number; stars: number; feedback: string | null; contactBranchId: number | null; googleRedirectShown: boolean } | null;
};

type BranchOption = { id: number; name: string; settings?: { whatsappPhone?: string | null } | null };

function whatsappUrl(phone: string, barcode: string, branchName: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) digits = `966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) digits = `966${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(`السلام عليكم، أبي أتواصل بخصوص الطلب #${barcode} مع ${branchName}`)}`;
}

function RatingExperience({ context, branches, onSubmit, onGoogleShown, promptKey }: {
  context: RatingContext;
  branches: BranchOption[];
  onSubmit: (input: { stars: number; feedback?: string; contactBranchId?: number | null }) => Promise<RatingContext>;
  onGoogleShown: () => Promise<unknown>;
  promptKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [contactBranchId, setContactBranchId] = useState<number | null>(null);
  const [saved, setSaved] = useState(context.rating);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setSaved(context.rating);
    if (!context.eligible || context.rating) return;
    const seenKey = `hattef-rating-prompt-${promptKey}`;
    if (window.sessionStorage.getItem(seenKey)) return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(seenKey, "1");
      setOpen(true);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [context.eligible, context.rating, promptKey]);
  const activeBranches = useMemo(() => branches.filter(branch => branch.settings?.whatsappPhone), [branches]);
  if (!context.eligible) return null;

  const submit = async () => {
    if (!stars) return toast.error("اختر عدد النجوم أولًا");
    setPending(true);
    try {
      const result = await onSubmit({ stars, feedback: feedback.trim() || undefined, contactBranchId: stars < 5 ? contactBranchId : null });
      setSaved(result.rating);
      toast.success("وصلنا تقييمك، وشكرًا لك 🩵");
      if (stars === 5 && result.branch.reviewUrl) {
        await onGoogleShown();
        window.open(result.branch.reviewUrl, "_blank", "noopener,noreferrer");
      } else if (stars < 5 && contactBranchId) {
        const branch = activeBranches.find(item => item.id === contactBranchId);
        if (branch?.settings?.whatsappPhone) window.open(whatsappUrl(branch.settings.whatsappPhone, context.order.barcode, branch.name), "_blank", "noopener,noreferrer");
      }
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التقييم");
    } finally {
      setPending(false);
    }
  };

  return <>
    {saved && <Card className="border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-3"><CheckCircle2 className="h-7 w-7 text-emerald-600" /><div><p className="font-black text-emerald-950">شكرًا على تقييمك</p><div className="mt-1 flex gap-1">{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`h-4 w-4 ${index < saved.stars ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />)}</div></div></div>{saved.stars === 5 && context.branch.reviewUrl && !saved.googleRedirectShown && <Button variant="outline" onClick={() => onGoogleShown().then(() => window.open(context.branch.reviewUrl!, "_blank", "noopener,noreferrer"))} className="mt-4 border-emerald-300 bg-white text-emerald-800"><ExternalLink className="h-4 w-4" />تقييم الفرع على Google</Button>}</Card>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg bg-white" dir="rtl"><DialogHeader><DialogTitle className="text-2xl font-black">بشّر، كل شيء على ما تحب؟ 🩵</DialogTitle><DialogDescription>قيّم صيانة الطلب #{context.order.barcode}. تقييمك يُحفظ مرة واحدة ويساعدنا نخدمك أفضل.</DialogDescription></DialogHeader><div className="flex justify-center gap-2 py-3" aria-label="اختر عدد النجوم">{Array.from({ length: 5 }, (_, index) => { const value = index + 1; return <button key={value} type="button" onClick={() => setStars(value)} aria-label={`${value} نجوم`} className="rounded-xl p-1 transition active:scale-95"><Star className={`h-10 w-10 ${value <= stars ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} /></button>; })}</div><Textarea value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="اكتب ملاحظتك إذا ودك" />{stars > 0 && stars < 5 && <Card className="border-orange-200 bg-orange-50 p-4"><div className="flex items-center gap-2"><HeartHandshake className="h-5 w-5 text-orange-600" /><p className="font-black text-orange-950">إذا ما رضيت تواصل معنا</p></div><p className="mt-1 text-xs text-orange-800">اختر الفرع اللي تبي تكلمه عبر واتساب:</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{activeBranches.map(branch => <button key={branch.id} type="button" onClick={() => setContactBranchId(branch.id)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition ${contactBranchId === branch.id ? "border-emerald-500 bg-emerald-500 text-white" : "border-orange-200 bg-white text-slate-700"}`}><MessageCircle className="h-4 w-4" />{branch.name}</button>)}</div></Card>}<Button onClick={submit} disabled={pending} className="w-full bg-sky-500 font-bold text-white hover:bg-sky-600">إرسال التقييم</Button></DialogContent></Dialog>
  </>;
}

export function PublicPostDeliveryRating({ token }: { token: string }) {
  const utils = trpc.useUtils();
  const context = trpc.ratings.public.get.useQuery({ token }, { retry: false });
  const branches = trpc.platform.branches.publicList.useQuery(undefined, { retry: false });
  const submit = trpc.ratings.public.submit.useMutation();
  const mark = trpc.ratings.public.markGoogleShown.useMutation();
  if (!context.data) return null;
  return <RatingExperience context={context.data} branches={branches.data ?? []} promptKey={`public-${context.data.order.id}`} onSubmit={async input => { const result = await submit.mutateAsync({ token, ...input }); await utils.ratings.public.get.invalidate({ token }); return result; }} onGoogleShown={() => mark.mutateAsync({ token })} />;
}

export function CustomerPostDeliveryRating({ orderId }: { orderId: number }) {
  const utils = trpc.useUtils();
  const context = trpc.ratings.customer.get.useQuery({ orderId }, { retry: false });
  const branches = trpc.platform.branches.publicList.useQuery(undefined, { retry: false });
  const submit = trpc.ratings.customer.submit.useMutation();
  const mark = trpc.ratings.customer.markGoogleShown.useMutation();
  if (!context.data) return null;
  return <RatingExperience context={context.data} branches={branches.data ?? []} promptKey={`account-${orderId}`} onSubmit={async input => { const result = await submit.mutateAsync({ orderId, ...input }); await utils.ratings.customer.get.invalidate({ orderId }); return result; }} onGoogleShown={() => mark.mutateAsync({ orderId })} />;
}
