import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Category = "in_repair" | "ready" | "after_delivery";

const titles: Record<Category, string> = {
  in_repair: "تحديث من الفني",
  ready: "جهازك صار جاهز",
  after_delivery: "بعد التسليم",
};

function statusCategory(status: string): Category | null {
  if (["pending", "diagnosing", "awaiting_approval", "in_progress"].includes(status)) return "in_repair";
  if (status === "ready") return "ready";
  if (status === "delivered") return "after_delivery";
  return null;
}

export function OrderStatusPopup({ branchId, status, orderToken }: { branchId?: number | null; status: string; orderToken: string }) {
  const category = statusCategory(status);
  const storageKey = category === "after_delivery"
    ? `deliveryPopupSeen_${orderToken}`
    : status
      ? `hattef-order-popup-seen-${orderToken}-${status}`
      : `hattef-order-popup-seen-${orderToken}`;
  const hasSeen = Boolean(window.localStorage.getItem(storageKey));
  const [open, setOpen] = useState(false);
  const claimAttempts = useRef(new Set<string>());
  const claimDeliveryPopup = trpc.engagement.claimDeliveryPopup.useMutation();
  const claimStatusPopup = trpc.engagement.claimStatusPopup.useMutation();
  const query = trpc.platform.popups.random.useQuery(
    { branchId: branchId ?? undefined, category: category ?? "in_repair", statusKey: status },
    { enabled: Boolean(category) && !hasSeen, retry: false, staleTime: Infinity },
  );

  useEffect(() => {
    if (!query.data || !category || hasSeen) return;
    let cancelled = false;
    let timer: number | undefined;

    async function showIfAllowed() {
      const claimKey = `${orderToken}:${status}`;
      if (claimAttempts.current.has(claimKey)) return;
      claimAttempts.current.add(claimKey);
      if (category === "after_delivery") {
        const claim = await claimDeliveryPopup.mutateAsync({ orderToken }).catch(() => ({ show: false as const }));
        if (!claim.show || cancelled) return;
      } else {
        const claim = await claimStatusPopup.mutateAsync({ orderToken, status }).catch(() => ({ show: false as const }));
        if (!claim.show || cancelled) return;
      }
      window.localStorage.setItem(storageKey, "1");
      timer = window.setTimeout(() => !cancelled && setOpen(true), 450);
    }

    void showIfAllowed();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [category, claimDeliveryPopup, claimStatusPopup, hasSeen, orderToken, query.data, status, storageKey]);

  if (!open || !query.data || !category) return null;

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" dir="rtl"><div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/70 bg-white p-7 text-center shadow-2xl"><button type="button" onClick={() => setOpen(false)} className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-label="إغلاق الرسالة"><X className="h-5 w-5" /></button><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-lg shadow-sky-500/20">{category === "after_delivery" ? <Heart className="h-7 w-7" /> : <MessageCircle className="h-7 w-7" />}</span><p className="mt-5 text-sm font-black text-sky-600">{titles[category]}</p><h2 className="mt-3 text-2xl font-black leading-[1.65] text-slate-950">{query.data.message}</h2><Button type="button" onClick={() => setOpen(false)} className="mt-6 bg-sky-500 px-8 font-bold text-white hover:bg-sky-600">تمام، وصلتني</Button></div></div>;
}
