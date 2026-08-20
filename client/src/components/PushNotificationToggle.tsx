import { useEffect, useState } from "react";
import { BellOff, BellRing, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Props =
  | { mode: "tracking"; token: string }
  | { mode: "customer"; token?: never };

type PushState = "checking" | "unsupported" | "disabled" | "enabled" | "denied" | "install_required";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PushNotificationToggle(props: Props) {
  const config = trpc.webPush.config.useQuery(undefined, { retry: false, staleTime: Infinity });
  const trackSubscribe = trpc.webPush.track.subscribe.useMutation();
  const trackUnsubscribe = trpc.webPush.track.unsubscribe.useMutation();
  const customerSubscribe = trpc.webPush.customer.subscribe.useMutation();
  const customerUnsubscribe = trpc.webPush.customer.unsubscribe.useMutation();
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (config.isLoading) return;
    if (!config.data?.enabled || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.register("/push-sw.js", { scope: "/" })
      .then(registration => registration.pushManager.getSubscription())
      .then(subscription => setState(subscription ? "enabled" : "disabled"))
      .catch(() => setState("unsupported"));
  }, [config.data?.enabled, config.isLoading]);

  async function enable() {
    if (isIosDevice() && !isStandalone()) {
      setState("install_required");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "disabled");
        return;
      }
      const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(config.data!.publicKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("بيانات الاشتراك غير مكتملة");
      const input = { endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
      if (props.mode === "tracking") await trackSubscribe.mutateAsync({ token: props.token, subscription: input });
      else await customerSubscribe.mutateAsync(input);
      setState("enabled");
      toast.success("تم تفعيل إشعارات جهازك");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تفعيل الإشعارات");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        if (props.mode === "tracking") await trackUnsubscribe.mutateAsync({ token: props.token, endpoint: subscription.endpoint });
        else await customerUnsubscribe.mutateAsync({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState("disabled");
      toast.success("تم إيقاف إشعارات الجهاز");
    } catch {
      toast.error("تعذر إيقاف الإشعارات");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") return null;

  return <Card className="border-sky-200 bg-gradient-to-l from-sky-50 to-white p-4 shadow-sm" dir="rtl">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${state === "enabled" ? "bg-emerald-500" : "bg-sky-500"} text-white`}>
          {state === "enabled" ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </span>
        <div>
          <h2 className="font-black text-slate-950">إشعارات جهازك</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {state === "enabled" && "مفعّلة؛ بيجيك تحديث حتى لو خرجت من الموقع."}
            {state === "disabled" && "اضغط «فعّل الإشعارات» ثم وافق على طلب المتصفح مرة واحدة؛ بعدها توصلك الجاهزية وتغيّر الحالة والرسائل فورًا. حماية المتصفح تمنع الموقع من الموافقة بدلًا عنك."}
            {state === "denied" && "الإشعارات محظورة من إعدادات المتصفح؛ اسمح بها ثم ارجع للموقع."}
            {state === "unsupported" && "جهازك أو متصفحك لا يدعم إشعارات الويب؛ ستبقى الرسائل داخل الموقع متاحة."}
            {state === "install_required" && "في iPhone: اضغط مشاركة، ثم «إضافة إلى الشاشة الرئيسية»، وافتح الموقع من الأيقونة وفعّل الإشعارات."}
          </p>
        </div>
      </div>
      {state === "enabled" ? <Button variant="outline" disabled={busy} onClick={disable} className="shrink-0 bg-white"><BellOff className="h-4 w-4" />إيقاف</Button> : (state === "disabled" || state === "install_required") && <Button disabled={busy} onClick={enable} className="min-h-12 shrink-0 bg-sky-500 px-5 font-black text-white shadow-md hover:bg-sky-600">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "install_required" ? <Download className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}{state === "install_required" ? "طريقة تفعيل iPhone" : "فعّل الإشعارات مرة واحدة"}</Button>}
    </div>
  </Card>;
}
