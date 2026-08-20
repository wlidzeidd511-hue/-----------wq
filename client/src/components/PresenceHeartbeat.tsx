import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { OWNER_LOGIN_PATH, SUPER_ADMIN_PATH } from "@/ownerPortal";

const INTERNAL_PATHS = ["/dashboard", OWNER_LOGIN_PATH, SUPER_ADMIN_PATH, "/owner-portal", "/team", "/admin"];

function readBranchId() {
  const value = Number(window.localStorage.getItem("hattef-current-branch-id"));
  return value > 0 ? value : null;
}

function getSessionKey() {
  const saved = window.localStorage.getItem("hattef-presence-session");
  if (saved) return saved;
  const generated = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem("hattef-presence-session", generated);
  return generated;
}

export function PresenceHeartbeat() {
  const [location] = useLocation();
  const [sessionKey] = useState(getSessionKey);
  const heartbeat = trpc.engagement.heartbeat.useMutation();
  const isInternal = INTERNAL_PATHS.some(path => location.startsWith(path));

  useEffect(() => {
    if (isInternal) return;
    const send = () => {
      if (document.visibilityState === "hidden") return;
      heartbeat.mutate({
        sessionKey,
        currentPath: `${window.location.pathname}${window.location.search}`.slice(0, 500),
        branchId: readBranchId(),
        orderToken: window.localStorage.getItem("hattef-current-order-token"),
      });
    };
    send();
    const interval = window.setInterval(send, 30_000);
    window.addEventListener("focus", send);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", send);
    };
  }, [isInternal, location, sessionKey]);

  return null;
}
