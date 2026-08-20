import { useEffect, useRef, useState } from "react";
import { BellRing, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { OWNER_LOGIN_PATH, SUPER_ADMIN_PATH } from "@/ownerPortal";

const LAST_MESSAGE_KEY = "hattef-direct-message-last-id";
const INTERNAL_PATHS = ["/dashboard", OWNER_LOGIN_PATH, SUPER_ADMIN_PATH, "/owner-portal", "/team", "/admin"];
type InboxMessage = { id: number; title: string | null; body: string; createdAt: number };

function readBranchId() {
  const value = Number(window.localStorage.getItem("hattef-current-branch-id"));
  return value > 0 ? value : null;
}

export function DirectMessageInbox() {
  const [location] = useLocation();
  const isInternal = INTERNAL_PATHS.some(path => location.startsWith(path));
  const [lastId, setLastId] = useState(() => Number(window.localStorage.getItem(LAST_MESSAGE_KEY)) || 0);
  const [sessionKey] = useState(() => window.localStorage.getItem("hattef-presence-session") || undefined);
  const [queue, setQueue] = useState<InboxMessage[]>([]);
  const dismissedIds = useRef(new Set<number>());
  const acknowledgedIds = useRef(new Set<number>());
  const acknowledgeMessage = trpc.engagement.acknowledgeMessage.useMutation();
  const branchId = readBranchId();
  const orderToken = location.startsWith("/track") || location.startsWith("/invoice")
    ? window.localStorage.getItem("hattef-current-order-token") || undefined
    : undefined;
  const inbox = trpc.engagement.inbox.useQuery(
    { afterId: lastId || undefined, branchId, sessionKey, orderToken },
    {
      enabled: !isInternal,
      retry: false,
      refetchInterval: 2_500,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  );

  useEffect(() => {
    if (isInternal || !("serviceWorker" in navigator)) return;
    const refresh = () => void inbox.refetch();
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "HATTEF_PUSH_REFRESH") refresh();
    };
    const handleVisibility = () => document.visibilityState === "visible" && refresh();
    navigator.serviceWorker.addEventListener("message", handleMessage);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [inbox.refetch, isInternal]);

  useEffect(() => {
    if (!inbox.data?.length) return;
    setQueue(current => {
      const known = new Set(current.map(message => message.id));
      return [...current, ...inbox.data.filter(message => message.id > lastId && !known.has(message.id) && !dismissedIds.current.has(message.id))].sort((a, b) => a.id - b.id);
    });
  }, [inbox.data, lastId]);

  const activeMessageId = queue[0]?.id;
  useEffect(() => {
    if (!activeMessageId || acknowledgedIds.current.has(activeMessageId)) return;
    acknowledgedIds.current.add(activeMessageId);
    acknowledgeMessage.mutate({ messageId: activeMessageId, branchId, sessionKey, orderToken });
  }, [activeMessageId, branchId, orderToken, sessionKey]);

  if (isInternal || queue.length === 0) return null;
  const message = queue[0];
  const dismiss = () => {
    dismissedIds.current.add(message.id);
    const nextLastId = Math.max(lastId, message.id);
    window.localStorage.setItem(LAST_MESSAGE_KEY, String(nextLastId));
    setLastId(nextLastId);
    setQueue(current => current.filter(item => item.id !== message.id));
    acknowledgeMessage.mutate({ messageId: message.id, branchId, sessionKey, orderToken });
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" dir="rtl"><article className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/70 bg-white p-7 text-center shadow-2xl sm:p-9"><button type="button" onClick={dismiss} className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-label="إغلاق الرسالة"><X className="h-5 w-5" /></button><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-lg shadow-sky-500/25"><BellRing className="h-8 w-8" /></span><p className="mt-5 text-xs font-black text-sky-600">رسالة من هاتف التميز</p><h2 className="mt-2 text-2xl font-black text-slate-950">{message.title || "عندنا لك رسالة"}</h2><p className="mt-4 whitespace-pre-wrap text-lg font-bold leading-9 text-slate-700">{message.body}</p><Button type="button" onClick={dismiss} className="mt-7 bg-sky-500 px-9 font-bold text-white hover:bg-sky-600">تم، شكرًا</Button>{queue.length > 1 && <p className="mt-3 text-xs text-slate-400">لديك {queue.length - 1} رسالة أخرى</p>}</article></div>;
}
