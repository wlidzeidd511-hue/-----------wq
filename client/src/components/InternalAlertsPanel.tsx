import { useMemo, useState } from "react";
import { AlertTriangle, Archive, BellRing, Box, CheckCircle2, Clock3, Loader2, Pencil, Plus, RotateCcw, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type AlertType = "part_shortage" | "important";
type AlertPriority = "normal" | "important" | "urgent";
type AlertStatus = "missing" | "ordered" | "arrived" | "resolved";

type InternalAlertRecord = {
  id: number;
  branchId: number;
  branchName: string;
  alertType: AlertType;
  title: string;
  partName: string | null;
  quantity: number | null;
  details: string | null;
  priority: AlertPriority;
  status: AlertStatus;
  createdByName: string;
  updatedByName: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  deleted: boolean;
  deletedAt: number | null;
  deletedByName: string | null;
};

type AlertForm = {
  branchId: string;
  alertType: AlertType;
  title: string;
  partName: string;
  quantity: string;
  details: string;
  priority: AlertPriority;
  status: AlertStatus;
};

type AlertSaveInput = {
  alertType: AlertType;
  title: string;
  partName: string | null;
  quantity: number | null;
  details: string | null;
  priority: AlertPriority;
  status: AlertStatus;
};

const statusOptions: Array<{ value: AlertStatus; label: string }> = [
  { value: "missing", label: "ناقصة / مفتوح" },
  { value: "ordered", label: "تم الطلب / قيد المتابعة" },
  { value: "arrived", label: "وصلت / تم التنفيذ" },
  { value: "resolved", label: "تم الحل" },
];

const priorityLabels: Record<AlertPriority, string> = { normal: "عادي", important: "مهم", urgent: "عاجل" };
const priorityClasses: Record<AlertPriority, string> = {
  normal: "border-sky-200 bg-sky-50 text-sky-800",
  important: "border-amber-200 bg-amber-50 text-amber-900",
  urgent: "border-red-300 bg-red-50 text-red-900",
};

function formatDate(value: number) {
  return new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(alert: Pick<InternalAlertRecord, "alertType" | "status">) {
  if (alert.status === "resolved") return "تم الحل";
  if (alert.alertType === "important") {
    if (alert.status === "ordered") return "قيد المتابعة";
    if (alert.status === "arrived") return "تم التنفيذ";
    return "مفتوح";
  }
  return statusOptions.find(option => option.value === alert.status)?.label.split(" /")[0] ?? alert.status;
}

function emptyForm(branchId?: number): AlertForm {
  return {
    branchId: branchId ? String(branchId) : "",
    alertType: "part_shortage",
    title: "",
    partName: "",
    quantity: "1",
    details: "",
    priority: "important",
    status: "missing",
  };
}

export function InternalAlertsBoard({
  alerts,
  branches,
  defaultBranchId,
  fixedBranch,
  loading,
  canCreate,
  canUpdate,
  canArchive,
  canDelete = false,
  archivedView = false,
  deletedView = false,
  onCreate,
  onUpdate,
  onArchive,
  onRemove,
}: {
  alerts: InternalAlertRecord[];
  branches?: Array<{ id: number; name: string; isActive?: boolean }>;
  defaultBranchId?: number;
  fixedBranch?: { id: number; name: string };
  loading: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
  canDelete?: boolean;
  archivedView?: boolean;
  deletedView?: boolean;
  onCreate: (input: AlertSaveInput & { branchId: number }) => Promise<void>;
  onUpdate: (id: number, input: Partial<AlertSaveInput>) => Promise<void>;
  onArchive?: (id: number, archived: boolean) => Promise<void>;
  onRemove?: (id: number, deleted: boolean) => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InternalAlertRecord | null>(null);
  const [form, setForm] = useState<AlertForm>(() => emptyForm(defaultBranchId ?? fixedBranch?.id ?? branches?.[0]?.id));
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<AlertType | "all">("all");
  const [saving, setSaving] = useState(false);

  const visibleAlerts = useMemo(() => alerts.filter(alert =>
    (statusFilter === "all" || alert.status === statusFilter) &&
    (typeFilter === "all" || alert.alertType === typeFilter),
  ), [alerts, statusFilter, typeFilter]);
  const urgentCount = alerts.filter(alert => alert.priority === "urgent" && alert.status !== "resolved").length;
  const missingPartsCount = alerts.filter(alert => alert.alertType === "part_shortage" && alert.status === "missing").length;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(defaultBranchId ?? fixedBranch?.id ?? branches?.find(branch => branch.isActive !== false)?.id));
    setDialogOpen(true);
  }

  function openEdit(alert: InternalAlertRecord) {
    setEditing(alert);
    setForm({
      branchId: String(alert.branchId),
      alertType: alert.alertType,
      title: alert.title,
      partName: alert.partName ?? "",
      quantity: alert.quantity ? String(alert.quantity) : "",
      details: alert.details ?? "",
      priority: alert.priority,
      status: alert.status,
    });
    setDialogOpen(true);
  }

  async function submit() {
    const title = form.title.trim() || form.partName.trim();
    if (!title) return toast.error("اكتب عنوان التنبيه أو اسم القطعة");
    const createBranchId = Number(form.branchId || fixedBranch?.id || 0);
    if (!editing && !createBranchId) return toast.error("تعذر تحديد الفرع؛ سجّل خروجك وادخل من جديد");
    setSaving(true);
    try {
      const payload = {
        alertType: form.alertType,
        title,
        partName: form.alertType === "part_shortage" ? form.partName.trim() || null : null,
        quantity: form.alertType === "part_shortage" && form.quantity ? Math.max(1, Number(form.quantity) || 1) : null,
        details: form.details.trim() || null,
        priority: form.priority,
        status: form.status,
      };
      if (editing) await onUpdate(editing.id, payload);
      else await onCreate({ ...payload, branchId: createBranchId });
      toast.success(editing ? "تم تحديث التنبيه" : "تم نشر التنبيه لكل مسؤولي الفرع");
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التنبيه");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(alert: InternalAlertRecord, status: AlertStatus) {
    try {
      await onUpdate(alert.id, { status });
      toast.success(`تم تحديث الحالة إلى: ${statusOptions.find(option => option.value === status)?.label}`);
    } catch {
      toast.error("تعذر تحديث حالة التنبيه");
    }
  }

  return (
    <Card className="overflow-hidden border-amber-200 bg-white shadow-lg shadow-amber-900/5" aria-label="التنبيهات المهمة والقطع الناقصة">
      <div className="bg-gradient-to-l from-amber-50 via-white to-red-50 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20">{deletedView ? <Trash2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}</span>
            <div><p className="text-xs font-black text-amber-700">{deletedView ? "لا تظهر للموظفين ويمكن استعادتها" : "تظهر لكل مسؤول مخوّل في الفرع"}</p><h2 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">{deletedView ? "سلة محذوفات التنبيهات" : "التنبيهات المهمة والقطع الناقصة"}</h2><p className="mt-1 text-sm text-slate-600">{deletedView ? "الحذف هنا آمن ولا يفقد سجل التنبيه أو هوية كاتبه." : "تابع القطعة من لحظة النقص حتى الطلب والوصول والحل."}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{urgentCount} عاجل</Badge>
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{missingPartsCount} قطعة ناقصة</Badge>
            {canCreate && !deletedView && <Button onClick={openCreate} className="bg-slate-950 font-bold text-white hover:bg-slate-800"><Plus className="h-4 w-4" />تنبيه جديد</Button>}
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:max-w-xl">
          <Select value={typeFilter} onValueChange={value => setTypeFilter(value as AlertType | "all")}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الأنواع</SelectItem><SelectItem value="part_shortage">القطع الناقصة</SelectItem><SelectItem value="important">التنبيهات المهمة</SelectItem></SelectContent></Select>
          <Select value={statusFilter} onValueChange={value => setStatusFilter(value as AlertStatus | "all")}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem>{statusOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>

      <div className="border-t border-amber-100 p-4 sm:p-5">
        {loading ? <div className="flex items-center justify-center gap-2 py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جاري تحميل التنبيهات...</div> : visibleAlerts.length === 0 ? <div className="py-10 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" /><p className="mt-3 font-black text-slate-800">لا توجد تنبيهات مطابقة</p><p className="mt-1 text-sm text-slate-500">{deletedView ? "سلة المحذوفات فارغة." : "أي قطعة ناقصة أو تنبيه مهم سيظهر هنا فورًا."}</p></div> : <div className="grid gap-3 lg:grid-cols-2">{visibleAlerts.map(alert => <article key={alert.id} className={`rounded-2xl border p-4 ${priorityClasses[alert.priority]} ${alert.status === "resolved" ? "opacity-70" : ""}`}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/75">{alert.alertType === "part_shortage" ? <Box className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}</span><div className="min-w-0"><div className="flex flex-wrap gap-2"><Badge variant="outline" className="border-current bg-white/60">{alert.alertType === "part_shortage" ? "قطعة ناقصة" : "تنبيه مهم"}</Badge><Badge variant="outline" className="border-current bg-white/60">{priorityLabels[alert.priority]}</Badge></div><h3 className="mt-2 text-base font-black text-slate-950">{alert.title}</h3>{alert.partName && <p className="mt-1 text-sm font-bold text-slate-800">{alert.partName}{alert.quantity ? ` · الكمية ${alert.quantity}` : ""}</p>}</div></div><Badge className="shrink-0 bg-white/75 text-slate-800 hover:bg-white/75">{statusLabel(alert)}</Badge></div>{alert.details && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{alert.details}</p>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-current/10 pt-3"><div className="space-y-1 text-[11px] text-slate-600"><p className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />كتبه: {alert.createdByName} · {alert.branchName}</p><p className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />آخر تحديث: {alert.updatedByName} · {formatDate(alert.updatedAt)}</p>{deletedView && alert.deletedAt && <p className="flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" />حذفه: {alert.deletedByName ?? "المالك"} · {formatDate(alert.deletedAt)}</p>}</div><div className="flex flex-wrap gap-2">{canUpdate && !deletedView && <Select value={alert.status} onValueChange={value => changeStatus(alert, value as AlertStatus)}><SelectTrigger className="h-9 w-40 bg-white/80 text-xs font-bold"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>}{canUpdate && !deletedView && <Button size="sm" variant="outline" className="bg-white/75" onClick={() => openEdit(alert)}><Pencil className="h-3.5 w-3.5" />تعديل</Button>}{canArchive && !deletedView && onArchive && <Button size="sm" variant="outline" className="bg-white/75" onClick={() => window.confirm(archivedView ? "استعادة التنبيه؟" : "أرشفة التنبيه؟") && onArchive(alert.id, !archivedView)}>{archivedView ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}{archivedView ? "استعادة" : "أرشفة"}</Button>}{canDelete && onRemove && <Button size="sm" variant="outline" className={deletedView ? "bg-white/75 text-emerald-700" : "bg-white/75 text-red-700"} onClick={() => window.confirm(deletedView ? "استعادة التنبيه من سلة المحذوفات؟" : "نقل التنبيه إلى سلة المحذوفات؟") && onRemove(alert.id, !deletedView)}>{deletedView ? <RotateCcw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}{deletedView ? "استعادة" : "حذف آمن"}</Button>}</div></div></article>)}</div>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto bg-white" dir="rtl"><DialogHeader><DialogTitle className="text-2xl font-black">{editing ? "تعديل التنبيه" : "إضافة تنبيه مهم"}</DialogTitle><DialogDescription>سيظهر التنبيه فورًا لجميع مسؤولي الفرع المخوّلين.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{!editing && branches && <label className="space-y-2"><span className="text-sm font-bold">الفرع</span><Select value={form.branchId} onValueChange={branchId => setForm(current => ({ ...current, branchId }))}><SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger><SelectContent>{branches.filter(branch => branch.isActive !== false).map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select></label>}{!editing && fixedBranch && !branches && <div data-testid="staff-alert-fixed-branch" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3"><span className="block text-xs font-bold text-sky-700">فرع التنبيه</span><strong className="mt-1 block text-slate-950">{fixedBranch.name}</strong></div>}<label className="space-y-2"><span className="text-sm font-bold">النوع</span><Select value={form.alertType} onValueChange={alertType => setForm(current => ({ ...current, alertType: alertType as AlertType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="part_shortage">قطعة ناقصة</SelectItem><SelectItem value="important">تنبيه مهم</SelectItem></SelectContent></Select></label><label className="space-y-2 sm:col-span-2"><span className="text-sm font-bold">عنوان التنبيه</span><Input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="مثال: ناقص شاشة آيفون 15 برو" /></label>{form.alertType === "part_shortage" && <><label className="space-y-2"><span className="text-sm font-bold">اسم القطعة</span><Input value={form.partName} onChange={event => setForm(current => ({ ...current, partName: event.target.value }))} placeholder="شاشة آيفون 15 برو" /></label><label className="space-y-2"><span className="text-sm font-bold">الكمية المطلوبة</span><Input type="number" min="1" max="9999" value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} /></label></>}<label className="space-y-2"><span className="text-sm font-bold">الأولوية</span><Select value={form.priority} onValueChange={priority => setForm(current => ({ ...current, priority: priority as AlertPriority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">عادي</SelectItem><SelectItem value="important">مهم</SelectItem><SelectItem value="urgent">عاجل</SelectItem></SelectContent></Select></label><label className="space-y-2"><span className="text-sm font-bold">الحالة</span><Select value={form.status} onValueChange={status => setForm(current => ({ ...current, status: status as AlertStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label><label className="space-y-2 sm:col-span-2"><span className="text-sm font-bold">التفاصيل والملاحظات</span><Textarea value={form.details} onChange={event => setForm(current => ({ ...current, details: event.target.value }))} className="min-h-28" placeholder="اكتب المقاس أو اللون أو المورد أو سبب الاستعجال..." /></label></div><Button onClick={submit} disabled={saving} className="w-full bg-slate-950 font-bold text-white hover:bg-slate-800">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}{editing ? "حفظ التعديلات" : "نشر التنبيه"}</Button></DialogContent></Dialog>
    </Card>
  );
}

export function OwnerInternalAlertsPanel({ selectedBranchId, branches, archived = false, deleted = false }: { selectedBranchId?: number; branches: Array<{ id: number; name: string; isActive?: boolean }>; archived?: boolean; deleted?: boolean }) {
  const utils = trpc.useUtils();
  const queryInput = selectedBranchId ? { branchId: selectedBranchId, archived, deleted } : { archived, deleted };
  const query = trpc.internalAlerts.owner.list.useQuery(queryInput, { retry: false, refetchInterval: 5_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
  const createMutation = trpc.internalAlerts.owner.create.useMutation();
  const updateMutation = trpc.internalAlerts.owner.update.useMutation();
  const archiveMutation = trpc.internalAlerts.owner.archive.useMutation();
  const removeMutation = trpc.internalAlerts.owner.remove.useMutation();
  const refresh = () => utils.internalAlerts.owner.list.invalidate();
  return <InternalAlertsBoard alerts={(query.data ?? []) as InternalAlertRecord[]} branches={branches} defaultBranchId={selectedBranchId} loading={query.isLoading} canCreate={!deleted} canUpdate={!deleted} canArchive={!deleted} canDelete archivedView={archived} deletedView={deleted} onCreate={async input => { await createMutation.mutateAsync(input); await refresh(); }} onUpdate={async (id, input) => { await updateMutation.mutateAsync({ id, ...input }); await refresh(); }} onArchive={async (id, archiveValue) => { await archiveMutation.mutateAsync({ id, archived: archiveValue }); toast.success(archiveValue ? "تمت أرشفة التنبيه" : "تمت استعادة التنبيه"); await refresh(); }} onRemove={async (id, deletedValue) => { await removeMutation.mutateAsync({ id, deleted: deletedValue }); toast.success(deletedValue ? "نُقل التنبيه إلى سلة المحذوفات" : "تمت استعادة التنبيه إلى الأرشيف"); await refresh(); }} />;
}

export function StaffInternalAlertsPanel({ canCreate, canUpdate, canDelete, branchId, branchName }: { canCreate: boolean; canUpdate: boolean; canDelete: boolean; branchId: number; branchName: string }) {
  const utils = trpc.useUtils();
  const query = trpc.internalAlerts.staff.list.useQuery(undefined, { retry: false, refetchInterval: 5_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
  const createMutation = trpc.internalAlerts.staff.create.useMutation();
  const updateMutation = trpc.internalAlerts.staff.update.useMutation();
  const removeMutation = trpc.internalAlerts.staff.remove.useMutation();
  const refresh = () => utils.internalAlerts.staff.list.invalidate();
  return <InternalAlertsBoard alerts={(query.data ?? []) as InternalAlertRecord[]} fixedBranch={{ id: branchId, name: branchName }} loading={query.isLoading} canCreate={canCreate} canUpdate={canUpdate} canArchive={false} canDelete={canDelete} onCreate={async input => { const { branchId: _branchId, ...payload } = input; await createMutation.mutateAsync(payload); await refresh(); }} onUpdate={async (id, input) => { await updateMutation.mutateAsync({ id, ...input }); await refresh(); }} onRemove={async id => { await removeMutation.mutateAsync({ id }); toast.success("نُقل التنبيه إلى سلة المحذوفات"); await refresh(); }} />;
}
