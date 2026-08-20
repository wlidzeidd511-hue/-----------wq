import { DatabaseBackup, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

function dateLabel(value: number | null | undefined) {
  return value ? new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }) : "—";
}

export function BackupAdminPanel() {
  const utils = trpc.useUtils();
  const backups = trpc.platform.backups.list.useQuery({ limit: 20 }, { retry: false });
  const createBackup = trpc.platform.backups.create.useMutation();
  const verifyBackup = trpc.platform.backups.verify.useMutation();
  async function refresh() { await utils.platform.backups.list.invalidate(); }
  async function create() {
    try { await createBackup.mutateAsync(); toast.success("تم إنشاء نسخة مشفرة في التخزين السحابي"); await refresh(); }
    catch { toast.error("تعذر إنشاء النسخة الاحتياطية"); }
  }
  async function verify(id: number) {
    try { await verifyBackup.mutateAsync({ id }); toast.success("تم فك النسخة والتحقق من سلامتها دون استعادتها فوق البيانات الحالية"); await refresh(); }
    catch { toast.error("فشل التحقق من النسخة الاحتياطية"); }
  }
  return <Card className="overflow-hidden"><div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-emerald-700"><DatabaseBackup className="h-5 w-5" /><span className="text-xs font-black">مشفر AES-256-GCM</span></div><h2 className="mt-1 text-xl font-black">النسخ الاحتياطية</h2><p className="mt-1 text-sm text-slate-500">حفظ سحابي لمدة 90 يومًا. التحقق يفك النسخة على الخادم ويطابق البصمة دون تغيير البيانات الحالية.</p></div><div className="flex gap-2"><Button variant="outline" onClick={refresh}><RefreshCw className="h-4 w-4" />تحديث</Button><Button onClick={create} disabled={createBackup.isPending}>{createBackup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}نسخة الآن</Button></div></div><div className="divide-y">{backups.isLoading ? <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div> : backups.data?.length ? backups.data.map(snapshot => <div key={snapshot.id} className="grid gap-3 p-4 text-sm lg:grid-cols-[1fr_auto_auto_auto_auto]"><div><strong>{snapshot.triggerType === "scheduled" ? "نسخة يومية" : "نسخة يدوية"}</strong><p className="mt-1 text-xs text-slate-500">{dateLabel(snapshot.createdAt)} · {snapshot.rowCount.toLocaleString("ar-SA")} سجل</p></div><Badge variant={snapshot.status === "completed" ? "default" : snapshot.status === "failed" ? "destructive" : "outline"}>{snapshot.status === "completed" ? "مكتملة" : snapshot.status === "failed" ? "فشلت" : "جاري الإنشاء"}</Badge><span className="text-xs text-slate-500">تنتهي {dateLabel(snapshot.expiresAt)}</span><span className="text-xs font-bold text-emerald-700">{snapshot.verifiedAt ? `تم التحقق ${dateLabel(snapshot.verifiedAt)}` : "لم تُفحص بعد"}</span><Button size="sm" variant="outline" disabled={snapshot.status !== "completed" || verifyBackup.isPending} onClick={() => verify(snapshot.id)}><ShieldCheck className="h-4 w-4" />تحقق</Button></div>) : <div className="p-8 text-center text-slate-500">لم تُنشأ نسخة احتياطية بعد.</div>}</div></Card>;
}
