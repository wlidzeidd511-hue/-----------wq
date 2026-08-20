import { useEffect, useRef, useState } from "react";
import { ArrowRight, Gift, Loader2, LockKeyhole, Trophy } from "lucide-react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { STORE_APP_ICON_URL } from "@shared/siteConfig";

export default function ScratchCard() {
  const [, params] = useRoute("/scratch/:code");
  const codeValue = params?.code ?? "";
  const me = trpc.accounts.customer.me.useQuery(undefined, { retry: false });
  const authenticated = Boolean(me.data?.authenticated);
  const code = trpc.scratch.customer.get.useQuery({ code: codeValue }, { enabled: authenticated && codeValue.length >= 20, retry: false });
  const beforeMessage = trpc.platform.popups.random.useQuery({ category: "before_scratch" }, { enabled: authenticated && code.data?.status === "assigned", retry: false });
  const resultCategory = code.data?.status === "redeemed" && code.data.isWinning ? "scratch_win" : "scratch_loss";
  const resultMessage = trpc.platform.popups.random.useQuery({ category: resultCategory }, { enabled: authenticated && code.data?.status === "redeemed", retry: false });
  const utils = trpc.useUtils();
  const redeem = trpc.scratch.customer.redeem.useMutation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratching = useRef(false);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || code.data?.status !== "assigned") return;
    const width = 760;
    const height = 300;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#cbd5e1");
    gradient.addColorStop(0.45, "#f8fafc");
    gradient.addColorStop(1, "#94a3b8");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#334155";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "900 48px sans-serif";
    context.fillText("اكشط هنا", width / 2, height / 2 - 18);
    context.font = "700 24px sans-serif";
    context.fillText("واسحب بإصبعك لكشف النتيجة", width / 2, height / 2 + 42);
  }, [code.data?.status, codeValue]);

  async function revealResult() {
    if (redeeming || redeem.isPending) return;
    setRedeeming(true);
    try {
      await redeem.mutateAsync({ code: codeValue });
      await utils.scratch.customer.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر كشف النتيجة");
    } finally {
      setRedeeming(false);
    }
  }

  function scratch(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!scratching.current || code.data?.status !== "assigned") return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(x, y, 45, 0, Math.PI * 2);
    context.fill();
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    for (let index = 3; index < data.length; index += 64) if (data[index] === 0) transparent += 1;
    const sampled = data.length / 64;
    if (transparent / sampled > 0.42) void revealResult();
  }

  if (me.isLoading || (authenticated && code.isLoading)) return <main className="flex min-h-screen items-center justify-center bg-sky-50"><Loader2 className="h-10 w-10 animate-spin text-sky-500" /></main>;
  if (!authenticated) return <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-violet-50 to-white p-4" dir="rtl"><Card className="max-w-md p-7 text-center"><img src={STORE_APP_ICON_URL} alt="الشعار الرسمي لهاتف التميز" className="mx-auto h-20 w-20 rounded-2xl object-contain shadow-sm ring-1 ring-sky-100" /><LockKeyhole className="mx-auto mt-4 h-10 w-10 text-violet-600" /><h1 className="mt-4 text-2xl font-black">ادخل حسابك أولًا</h1><p className="mt-2 leading-7 text-slate-600">الكود مربوط بحساب العميل والفاتورة، ولا يمكن فتحه من حساب آخر.</p><Link href="/account" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-violet-600 px-6 font-bold text-white">دخول حساب العميل</Link></Card></main>;
  if (code.isError || !code.data) return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4" dir="rtl"><Card className="max-w-md p-7 text-center"><Gift className="mx-auto h-12 w-12 text-slate-400" /><h1 className="mt-4 text-2xl font-black">الكود غير موجود في حسابك</h1><Link href="/account" className="mt-5 inline-flex font-bold text-sky-700">العودة إلى حسابي</Link></Card></main>;

  const item = code.data;
  const expired = item.status === "expired";
  const redeemed = item.status === "redeemed";
  return <main className="min-h-screen bg-gradient-to-b from-violet-50 via-sky-50 to-white px-4 py-8" dir="rtl"><div className="mx-auto max-w-3xl"><div className="mb-5 flex items-center justify-between gap-3"><Link href="/account" className="inline-flex items-center gap-2 font-bold text-slate-600"><ArrowRight className="h-4 w-4" />حسابي</Link><Badge className="bg-violet-100 text-violet-800">فاتورة #{item.orderBarcode}</Badge></div><Card className="overflow-hidden border-white bg-white/95 shadow-2xl shadow-violet-900/10"><div className="bg-gradient-to-l from-violet-600 to-sky-500 p-7 text-center text-white"><img src={STORE_APP_ICON_URL} alt="الشعار الرسمي لهاتف التميز" className="mx-auto h-20 w-20 rounded-2xl bg-white object-contain shadow-lg" /><h1 className="mt-3 text-3xl font-black">اكشط واربح</h1><p className="mt-2 font-bold">{item.branchName} · {item.deviceInfo}</p></div><div className="p-5 sm:p-8">{expired ? <div className="py-12 text-center"><Gift className="mx-auto h-14 w-14 text-slate-300" /><h2 className="mt-4 text-2xl font-black">انتهت صلاحية الكود</h2><p className="mt-2 text-slate-600">صلاحية الكود 72 ساعة من وقت تسليم الجهاز.</p></div> : redeemed ? <div className={`rounded-3xl p-8 text-center ${item.isWinning ? "bg-gradient-to-br from-amber-50 to-yellow-100" : "bg-slate-50"}`}>{item.isWinning ? <Trophy className="mx-auto h-16 w-16 text-amber-500" /> : <Gift className="mx-auto h-16 w-16 text-slate-400" />}<h2 className="mt-4 text-3xl font-black">{item.isWinning ? "مبروك فزت!" : "حظ أوفر بالمرة الجاية"}</h2>{item.isWinning && <><p className="mt-3 text-xl font-black text-violet-800">{item.prizeName}</p>{item.prizeDescription && <p className="mt-2 leading-7 text-slate-600">{item.prizeDescription}</p>}</>}<p className="mt-5 text-sm font-bold text-slate-600">{resultMessage.data?.message}</p></div> : <div><div className="mb-5 rounded-2xl bg-sky-50 p-4 text-center font-bold leading-7 text-sky-900">{beforeMessage.data?.message || "اكشط وشوف حظك… يمكن تكون الجائزة لك!"}</div><div className="relative overflow-hidden rounded-3xl border-4 border-violet-100 bg-gradient-to-br from-white to-violet-50 shadow-inner"><div className="flex aspect-[760/300] items-center justify-center p-6 text-center"><div><Gift className="mx-auto h-14 w-14 text-violet-500" /><p className="mt-3 text-xl font-black text-violet-900">النتيجة مخفية</p></div></div><canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none cursor-crosshair" onPointerDown={event => { scratching.current = true; event.currentTarget.setPointerCapture(event.pointerId); scratch(event); }} onPointerMove={scratch} onPointerUp={() => { scratching.current = false; }} onPointerCancel={() => { scratching.current = false; }} aria-label="منطقة كشط للكشف عن النتيجة" /></div>{redeeming && <p className="mt-4 flex items-center justify-center gap-2 font-bold text-violet-700"><Loader2 className="h-4 w-4 animate-spin" />جاري تثبيت النتيجة...</p>}<Button variant="outline" onClick={revealResult} className="mt-4 w-full">تعذر الكشط؟ اكشف النتيجة</Button></div>}</div></Card></div></main>;
}
