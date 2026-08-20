import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  ClipboardCopy,
  Gift,
  KeyRound,
  Loader2,
  MapPin,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Store,
  Trash2,
  UserCog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { PopupMessageEditor } from "@/components/PopupMessageEditor";
import { PopupCategoryControls } from "@/components/PopupCategoryControls";
import { ScratchAdminPanel } from "@/components/ScratchAdminPanel";
import { WaitingScreenEditor } from "@/components/WaitingScreenEditor";
import { BackupAdminPanel } from "@/components/BackupAdminPanel";
import { SiteContentEditor } from "@/components/SiteContentEditor";
import { OWNER_LOGIN_PATH } from "@/ownerPortal";
import { STORE_APP_ICON_URL } from "@shared/siteConfig";
import { toast } from "sonner";

const categoryLabels = {
  in_repair: "أثناء الصيانة",
  ready: "صار جاهز",
  before_rating: "قبل التقييم",
  after_delivery: "بعد التسليم",
  before_scratch: "قبل الكشط",
  scratch_win: "فاز بالكشط",
  scratch_loss: "خسر بالكشط",
} as const;

type PopupCategory = keyof typeof categoryLabels;

const permissionLabels = {
  "orders.view_branch": "عرض طلبات الفرع",
  "orders.create": "إنشاء الفواتير",
  "orders.update_intake": "تحديث بيانات الاستلام",
  "orders.update_status": "تغيير حالة الفاتورة",
  "orders.view_prices": "عرض وإدخال السعر والمدفوع والتكلفة",
  "orders.view_internal_notes": "عرض الملاحظات الداخلية للمالك",
  "customers.view": "البحث عن العملاء وفواتيرهم",
  "customers.create": "إنشاء العملاء وتغيير العميل المرتبط",
  "photos.upload": "رفع صور الجهاز",
  "photos.view": "عرض صور الجهاز",
  "alerts.view": "عرض التنبيهات والقطع الناقصة",
  "alerts.create": "إضافة تنبيه أو قطعة ناقصة",
  "alerts.update": "تحديث حالة التنبيهات",
  "alerts.delete": "حذف التنبيهات إلى سلة المحذوفات",
} as const;

type PermissionKey = keyof typeof permissionLabels;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2"><span className="block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}

function WhatsAppTemplateEditor({
  template,
  onSave,
}: {
  template: { id: number; eventType: string; bodyPreview: string; templateName: string | null; isActive: boolean };
  onSave: (input: { id: number; bodyPreview: string; templateName: string | null; isActive: boolean }) => Promise<void>;
}) {
  const [bodyPreview, setBodyPreview] = useState(template.bodyPreview);
  const [templateName, setTemplateName] = useState(template.templateName ?? "");
  const [isActive, setIsActive] = useState(template.isActive);
  return <Card className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-emerald-700">{template.eventType}</p><h3 className="mt-1 font-black">قالب قابل للتعديل</h3></div><Switch checked={isActive} onCheckedChange={setIsActive} /></div><div className="mt-4 space-y-3"><Field label="اسم قالب Meta لاحقًا"><Input value={templateName} onChange={event => setTemplateName(event.target.value)} dir="ltr" placeholder="يُترك فارغًا حتى اعتماد القالب" /></Field><Field label="نص الرسالة"><Textarea value={bodyPreview} onChange={event => setBodyPreview(event.target.value)} className="min-h-28" /></Field></div><Button className="mt-4" size="sm" onClick={() => onSave({ id: template.id, bodyPreview, templateName: templateName || null, isActive })}><Save className="h-4 w-4" />حفظ القالب</Button></Card>;
}

function StaffPermissionsEditor({
  staffId,
  permissions,
  saving,
  onSave,
}: {
  staffId: number;
  permissions: PermissionKey[];
  saving: boolean;
  onSave: (staffId: number, permissions: PermissionKey[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<PermissionKey[]>(permissions);

  useEffect(() => setSelected(permissions), [permissions]);

  return (
    <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
      <p className="text-sm font-black text-slate-800">تعديل صلاحيات الموظف</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {Object.entries(permissionLabels).map(([key, label]) => {
          const permission = key as PermissionKey;
          return (
            <label key={permission} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3 text-xs font-bold text-slate-700">
              <span>{label}</span>
              <Switch
                checked={selected.includes(permission)}
                onCheckedChange={checked => setSelected(current => checked ? (current.includes(permission) ? current : [...current, permission]) : current.filter(item => item !== permission))}
              />
            </label>
          );
        })}
      </div>
      <Button className="mt-3" size="sm" disabled={saving} onClick={() => onSave(staffId, selected)}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        حفظ الصلاحيات
      </Button>
    </div>
  );
}

function StaffProfileEditor({
  staff,
  saving,
  onSave,
}: {
  staff: { id: number; name: string; username: string; phone: string | null; jobTitle: string | null };
  saving: boolean;
  onSave: (input: { id: number; name: string; username: string; phone: string | null; jobTitle: string | null }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: staff.name, username: staff.username, phone: staff.phone ?? "", jobTitle: staff.jobTitle ?? "" });

  useEffect(() => {
    setForm({ name: staff.name, username: staff.username, phone: staff.phone ?? "", jobTitle: staff.jobTitle ?? "" });
  }, [staff.id, staff.name, staff.username, staff.phone, staff.jobTitle]);

  async function save() {
    const username = form.username.normalize("NFKC").trim().replace(/\s+/g, "");
    if (form.name.trim().length < 2) return toast.error("اسم الموظف لازم يكون حرفين على الأقل");
    if (username.length < 2 || !/^[A-Za-z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF._-]+$/.test(username)) return toast.error("تحقق من اسم الدخول");
    await onSave({ id: staff.id, name: form.name.trim(), username, phone: form.phone.trim() || null, jobTitle: form.jobTitle.trim() || null });
    setOpen(false);
  }

  return <div className="mt-4 rounded-2xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black text-slate-900">بيانات الموظف واسم الدخول</p><p className="mt-1 text-xs text-slate-500">تغيير اسم الدخول يسجّل خروج الموظف من أجهزته حمايةً للحساب.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setOpen(value => !value)}>{open ? "إلغاء" : "تعديل البيانات"}</Button></div>{open && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="اسم الموظف"><Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field><Field label="اسم الدخول"><Input value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} dir="ltr" /></Field><Field label="رقم الجوال"><Input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} dir="ltr" /></Field><Field label="المسمى الوظيفي"><Input value={form.jobTitle} onChange={event => setForm({ ...form, jobTitle: event.target.value })} /></Field><Button type="button" className="sm:col-span-2" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ بيانات الموظف</Button></div>}</div>;
}

function StaffPasswordEditor({
  staffId,
  staffName,
  saving,
  onSave,
}: {
  staffId: number;
  staffName: string;
  saving: boolean;
  onSave: (staffId: number, newPassword: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function save() {
    if (newPassword.length < 8) return toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return toast.error("استخدم حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا خاصًا");
    }
    if (newPassword !== confirmPassword) return toast.error("تأكيد كلمة المرور غير مطابق");
    await onSave(staffId, newPassword);
    setNewPassword("");
    setConfirmPassword("");
    setOpen(false);
  }

  return (
    <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-black text-slate-900">كلمة مرور {staffName}</p><p className="mt-1 text-xs leading-5 text-slate-600">تبقى دائمة حتى تغيّرها أنت، وتُبطل كل جلساته السابقة فور الحفظ.</p></div>
        <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => setOpen(value => !value)}><KeyRound className="h-4 w-4" />{open ? "إلغاء" : "تغيير كلمة المرور"}</Button>
      </div>
      {open && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="كلمة المرور الجديدة"><Input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="مثال: 12Qwaszx*" dir="ltr" /></Field><Field label="تأكيد كلمة المرور"><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} onKeyDown={event => event.key === "Enter" && void save()} dir="ltr" /></Field><Button type="button" disabled={saving} onClick={() => void save()} className="sm:col-span-2"><Save className="h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ كلمة المرور الدائمة"}</Button></div>}
    </div>
  );
}

function StaffBranchTransfer({
  staffId,
  staffName,
  currentBranchId,
  branches,
  saving,
  onTransfer,
}: {
  staffId: number;
  staffName: string;
  currentBranchId: number;
  branches: Array<{ id: number; name: string }>;
  saving: boolean;
  onTransfer: (staffId: number, targetBranchId: number) => Promise<void>;
}) {
  const [targetBranchId, setTargetBranchId] = useState("");
  const available = branches.filter(branch => branch.id !== currentBranchId);
  if (!available.length) return null;

  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4 text-amber-700" /><p className="text-sm font-black text-amber-950">نقل الموظف إلى فرع آخر</p></div>
      <p className="mt-1 text-xs font-bold leading-5 text-amber-800">النقل يغيّر فرع {staffName} فورًا ويبطل جلسته القديمة؛ يدخل من جديد بنفس اليوزر وكلمة المرور.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Select value={targetBranchId} onValueChange={setTargetBranchId}><SelectTrigger className="bg-white"><SelectValue placeholder="اختر الفرع الجديد" /></SelectTrigger><SelectContent>{available.map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select>
        <Button type="button" variant="outline" className="shrink-0 border-amber-300 bg-white text-amber-900" disabled={saving || !targetBranchId} onClick={() => { const target = available.find(branch => branch.id === Number(targetBranchId)); if (!target || !window.confirm(`نقل ${staffName} من فرعه الحالي إلى ${target.name}؟ سيتم تسجيل خروجه من جميع أجهزته.`)) return; void onTransfer(staffId, target.id).then(() => setTargetBranchId("")); }}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}نقل الموظف</Button>
      </div>
    </div>
  );
}

export default function OwnerControl() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const ownerQuery = trpc.owner.me.useQuery(undefined, { retry: false });
  const authenticated = Boolean(ownerQuery.data?.authenticated);
  const branchAccessQuery = trpc.branchAccess.me.useQuery(undefined, { enabled: authenticated, retry: false });
  const branchAuthenticated = Boolean(branchAccessQuery.data?.authenticated);
  const branchId = branchAccessQuery.data?.authenticated ? branchAccessQuery.data.branch?.branchId : undefined;
  const branchesQuery = trpc.platform.branches.list.useQuery(undefined, { enabled: authenticated, retry: false });
  const staffQuery = trpc.accounts.staff.list.useQuery(
    { branchId, includeInactive: true },
    { enabled: authenticated && branchAuthenticated && Boolean(branchId), retry: false },
  );
  const popupsQuery = trpc.platform.popups.list.useQuery(
    { branchId, includeInactive: true },
    { enabled: authenticated && branchAuthenticated && Boolean(branchId), retry: false },
  );
  const auditQuery = trpc.platform.audit.useQuery(
    branchId ? { branchId, limit: 100 } : { limit: 100 },
    { enabled: authenticated && branchAuthenticated && Boolean(branchId), retry: false },
  );
  const whatsappTemplatesQuery = trpc.platform.whatsapp.templates.useQuery(
    { branchId },
    { enabled: authenticated && branchAuthenticated && Boolean(branchId), retry: false },
  );
  const whatsappQueueQuery = trpc.platform.whatsapp.queue.useQuery(
    branchId ? { branchId, limit: 200 } : { limit: 200 },
    { enabled: authenticated && branchAuthenticated && Boolean(branchId), retry: false },
  );

  const createBranch = trpc.platform.branches.create.useMutation();
  const updateBranch = trpc.platform.branches.update.useMutation();
  const updateBranchSettings = trpc.platform.branches.updateSettings.useMutation();
  const createStaff = trpc.accounts.staff.create.useMutation();
  const updateStaff = trpc.accounts.staff.update.useMutation();
  const transferStaffMutation = trpc.accounts.staff.transferBranch.useMutation();
  const setStaffPasswordMutation = trpc.accounts.staff.setPassword.useMutation();
  const removeStaffMutation = trpc.accounts.staff.remove.useMutation();
  const changeBranchPasswordMutation = trpc.branchAccess.changePassword.useMutation();
  const createPopup = trpc.platform.popups.create.useMutation();
  const updatePopup = trpc.platform.popups.update.useMutation();
  const deletePopup = trpc.platform.popups.delete.useMutation();
  const updateWhatsappTemplate = trpc.platform.whatsapp.updateTemplate.useMutation();
  const markWhatsappManualSent = trpc.platform.whatsapp.markManualSent.useMutation();

  const [branchForm, setBranchForm] = useState({ name: "", slug: "", code: "" });
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const selectedBranch = branchesQuery.data?.find(branch => branch.id === selectedBranchId);
  const [settingsForm, setSettingsForm] = useState({
    displayName: "",
    phone: "",
    whatsappPhone: "",
    address: "",
    mapUrl: "",
    mapsReviewUrl: "",
    openingHours: "",
    warrantyPolicy: "",
    currency: "ر.س",
    invoicePrefix: "",
    waitingScreenEnabled: true,
    whatsappEnabled: false,
  });
  const [staffForm, setStaffForm] = useState({
    branchId: "1",
    name: "",
    username: "",
    phone: "",
    jobTitle: "",
    permissions: Object.keys(permissionLabels) as PermissionKey[],
  });
  const [temporaryCredential, setTemporaryCredential] = useState<{ username: string; password: string } | null>(null);
  const [branchPasswordForm, setBranchPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [popupForm, setPopupForm] = useState({
    branchId: "all",
    category: "in_repair" as PopupCategory,
    message: "",
    weight: "1",
  });

  useEffect(() => {
    if (!ownerQuery.isLoading && !authenticated) navigate(OWNER_LOGIN_PATH);
  }, [authenticated, navigate, ownerQuery.isLoading]);

  useEffect(() => {
    if (authenticated && !branchAccessQuery.isLoading && !branchAuthenticated) navigate("/dashboard/branches");
  }, [authenticated, branchAccessQuery.isLoading, branchAuthenticated, navigate]);

  useEffect(() => {
    if (!selectedBranch) return;
    const settings = selectedBranch.settings;
    setSettingsForm({
      displayName: settings?.displayName ?? selectedBranch.name,
      phone: settings?.phone ?? "",
      whatsappPhone: settings?.whatsappPhone ?? "",
      address: settings?.address ?? "",
      mapUrl: settings?.mapUrl ?? "",
      mapsReviewUrl: settings?.mapsReviewUrl ?? "",
      openingHours: settings?.openingHours ?? "",
      warrantyPolicy: settings?.warrantyPolicy ?? "",
      currency: settings?.currency ?? "ر.س",
      invoicePrefix: settings?.invoicePrefix ?? "",
      waitingScreenEnabled: settings?.waitingScreenEnabled ?? true,
      whatsappEnabled: settings?.whatsappEnabled ?? false,
    });
  }, [selectedBranch]);

  useEffect(() => {
    if (branchId) {
      setStaffForm(form => ({ ...form, branchId: String(branchId) }));
      setPopupForm(form => ({ ...form, branchId: String(branchId) }));
    }
  }, [branchId]);

  const visibleBranches = useMemo(() => branchesQuery.data?.filter(branch => branch.id === branchId) ?? [], [branchId, branchesQuery.data]);
  const activeBranches = useMemo(() => visibleBranches.filter(branch => branch.isActive), [visibleBranches]);
  const transferBranches = useMemo(() => branchesQuery.data?.filter(branch => branch.isActive).map(branch => ({ id: branch.id, name: branch.name })) ?? [], [branchesQuery.data]);

  async function refresh() {
    await Promise.all([
      utils.platform.branches.list.invalidate(),
      utils.accounts.staff.list.invalidate(),
      utils.platform.popups.list.invalidate(),
      utils.platform.popups.categorySettings.invalidate(),
      utils.platform.audit.invalidate(),
      utils.platform.whatsapp.templates.invalidate(),
      utils.platform.whatsapp.queue.invalidate(),
    ]);
  }

  async function handleCreateBranch() {
    if (!branchForm.name.trim() || !branchForm.slug.trim() || !branchForm.code.trim()) return toast.error("أكمل بيانات الفرع");
    try {
      await createBranch.mutateAsync({
        name: branchForm.name.trim(),
        slug: branchForm.slug.trim().toLowerCase(),
        code: branchForm.code.trim().toUpperCase(),
      });
      setBranchForm({ name: "", slug: "", code: "" });
      toast.success("تم إنشاء الفرع");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء الفرع");
    }
  }

  async function handleSaveBranchSettings() {
    if (!selectedBranchId) return;
    try {
      await updateBranchSettings.mutateAsync({
        branchId: selectedBranchId,
        displayName: settingsForm.displayName || null,
        phone: settingsForm.phone || null,
        whatsappPhone: settingsForm.whatsappPhone || null,
        address: settingsForm.address || null,
        mapUrl: settingsForm.mapUrl || null,
        mapsReviewUrl: settingsForm.mapsReviewUrl || null,
        openingHours: settingsForm.openingHours || null,
        warrantyPolicy: settingsForm.warrantyPolicy || null,
        currency: settingsForm.currency,
        invoicePrefix: settingsForm.invoicePrefix || null,
        waitingScreenEnabled: settingsForm.waitingScreenEnabled,
        whatsappEnabled: settingsForm.whatsappEnabled,
      });
      toast.success("تم حفظ إعدادات الفرع");
      await refresh();
    } catch {
      toast.error("تعذر حفظ إعدادات الفرع");
    }
  }

  async function handleCreateStaff() {
    if (!branchId) return toast.error("افتح الفرع أولًا");
    const username = staffForm.username.normalize("NFKC").trim().replace(/\s+/g, "");
    if (!staffForm.name.trim()) return toast.error("اكتب اسم الموظف");
    if (username.length < 2) return toast.error("اسم الدخول لازم يكون حرفين على الأقل");
    if (!/^[A-Za-z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF._-]+$/.test(username)) return toast.error("اسم الدخول يقبل حروفًا عربية أو إنجليزية وأرقامًا والنقطة والشرطة فقط");
    if (!staffForm.permissions.length) return toast.error("اختر صلاحية واحدة على الأقل للموظف");
    try {
      const result = await createStaff.mutateAsync({
        branchId,
        name: staffForm.name.trim(),
        username,
        phone: staffForm.phone.trim() || null,
        jobTitle: staffForm.jobTitle.trim() || null,
        permissions: staffForm.permissions,
      });
      if (!result?.staff) throw new Error("تعذر إنشاء حساب الموظف");
      setTemporaryCredential({ username: result.staff.username, password: result.temporaryPassword });
      setStaffForm(form => ({ ...form, name: "", username: "", phone: "", jobTitle: "" }));
      toast.success("تم إنشاء حساب الموظف");
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("مستخدم من موظف آخر") || message.includes("CONFLICT")) toast.error("اسم الدخول مستخدم من موظف آخر؛ اختر اسمًا مختلفًا");
      else if (message.startsWith("[") || message.includes("invalid_format") || message.includes("username")) toast.error("تحقق من اسم الدخول وبيانات الموظف ثم حاول مرة أخرى");
      else toast.error(message || "تعذر إنشاء الموظف؛ حاول مرة أخرى");
    }
  }

  async function handleSetStaffPassword(id: number, newPassword: string) {
    await setStaffPasswordMutation.mutateAsync({ id, newPassword });
    toast.success("تم حفظ كلمة المرور الدائمة وإبطال جلسات الموظف القديمة");
    await refresh();
  }

  async function handleUpdateStaffProfile(input: { id: number; name: string; username: string; phone: string | null; jobTitle: string | null }) {
    try {
      await updateStaff.mutateAsync(input);
      toast.success("تم حفظ بيانات الموظف");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ بيانات الموظف");
    }
  }

  async function handleTransferStaff(id: number, targetBranchId: number) {
    try {
      const result = await transferStaffMutation.mutateAsync({ id, targetBranchId });
      toast.success(`تم نقل الموظف إلى ${result.targetBranch.name} وإبطال جلسته القديمة`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر نقل الموظف");
    }
  }

  async function handleRemoveStaff(id: number, staffName: string) {
    if (!window.confirm(`متأكد من حذف حساب ${staffName}؟ سيُمنع دخوله فورًا مع بقاء سجلات الفواتير باسمه.`)) return;
    try {
      await removeStaffMutation.mutateAsync({ id });
      toast.success("تم حذف حساب الموظف بأمان وإبطال جلساته القديمة");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف حساب الموظف");
    }
  }

  async function handleChangeBranchPassword() {
    if (!branchPasswordForm.currentPassword) return toast.error("اكتب كلمة حماية الفرع الحالية");
    if (branchPasswordForm.newPassword !== branchPasswordForm.confirmPassword) return toast.error("تأكيد كلمة الحماية الجديدة غير مطابق");
    try {
      await changeBranchPasswordMutation.mutateAsync({
        currentPassword: branchPasswordForm.currentPassword,
        newPassword: branchPasswordForm.newPassword,
      });
      setBranchPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("تم تغيير كلمة حماية الفرع وإبطال جلساته القديمة");
      await utils.branchAccess.me.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تغيير كلمة حماية الفرع");
    }
  }

  async function handleCreatePopup() {
    if (!branchId) return toast.error("افتح الفرع أولًا");
    if (!popupForm.message.trim()) return toast.error("اكتب الرسالة");
    await createPopup.mutateAsync({
      branchId,
      category: popupForm.category,
      message: popupForm.message.trim(),
      weight: Math.max(1, Number(popupForm.weight) || 1),
      isActive: true,
    });
    setPopupForm(form => ({ ...form, message: "", weight: "1" }));
    toast.success("تمت إضافة الرسالة العشوائية");
    await refresh();
  }

  if (ownerQuery.isLoading || (authenticated && branchAccessQuery.isLoading) || !authenticated || !branchAuthenticated || !branchId) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-sky-50" dir="rtl"><Loader2 className="h-9 w-9 animate-spin text-sky-500" /><p className="text-sm font-bold text-slate-600">جاري التحقق من جلسة المالك والفرع...</p></div>;

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur-xl">
        <div className="container flex min-h-20 flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white p-0.5 shadow-sm ring-1 ring-sky-100"><img src={STORE_APP_ICON_URL} alt="الشعار الرسمي لهاتف التميز" className="h-full w-full object-contain" /></span><div><h1 className="text-xl font-black">مركز إدارة المنصة</h1><p className="text-xs text-slate-500">الفروع والموظفون والرسائل وسجل العمليات</p></div></div>
          <div className="flex items-center gap-2"><Button variant="outline" onClick={() => navigate("/dashboard/branches")} className="bg-white"><Store className="h-4 w-4" />{visibleBranches[0]?.name ?? branchAccessQuery.data?.branch?.branchName ?? "الفرع المفتوح"}</Button><Button variant="outline" onClick={refresh}><RefreshCw className="h-4 w-4" />تحديث</Button><Button onClick={() => navigate("/dashboard")}><ArrowRight className="h-4 w-4" />الطلبات</Button></div>
        </div>
      </header>

      <main className="container py-7">
        <Tabs defaultValue="branches" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-white p-2 shadow-sm md:grid-cols-7">
            <TabsTrigger value="branches"><Building2 className="h-4 w-4" />الفروع</TabsTrigger>
            <TabsTrigger value="staff"><UserCog className="h-4 w-4" />الموظفون</TabsTrigger>
            <TabsTrigger value="messages"><MessageSquareText className="h-4 w-4" />الرسائل</TabsTrigger>
            <TabsTrigger value="content"><MessageSquareText className="h-4 w-4" />النصوص</TabsTrigger>
            <TabsTrigger value="scratch"><Gift className="h-4 w-4" />اكشط واربح</TabsTrigger>
            <TabsTrigger value="whatsapp"><Send className="h-4 w-4" />واتساب</TabsTrigger>
            <TabsTrigger value="audit"><ShieldCheck className="h-4 w-4" />سجل العمليات</TabsTrigger>
          </TabsList>

          <TabsContent value="branches" className="space-y-6">
            {selectedBranch && <WaitingScreenEditor branchId={selectedBranch.id} slug={selectedBranch.slug} />}
            <Card className="border-sky-200 p-5"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><KeyRound className="h-5 w-5" /></span><div><h2 className="text-lg font-black">كلمة حماية الفرع المفتوح</h2><p className="mt-1 text-sm text-slate-500">تغييرها يُبطل كل جلسات الفرع السابقة، وتبقى جلستك الحالية مفعلة بالكلمة الجديدة.</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-3"><Field label="الكلمة الحالية"><Input type="password" autoComplete="current-password" value={branchPasswordForm.currentPassword} onChange={event => setBranchPasswordForm({ ...branchPasswordForm, currentPassword: event.target.value })} dir="ltr" /></Field><Field label="الكلمة الجديدة"><Input type="password" autoComplete="new-password" value={branchPasswordForm.newPassword} onChange={event => setBranchPasswordForm({ ...branchPasswordForm, newPassword: event.target.value })} dir="ltr" /></Field><Field label="تأكيد الكلمة الجديدة"><Input type="password" autoComplete="new-password" value={branchPasswordForm.confirmPassword} onChange={event => setBranchPasswordForm({ ...branchPasswordForm, confirmPassword: event.target.value })} dir="ltr" /></Field></div><Button className="mt-4" onClick={handleChangeBranchPassword} disabled={changeBranchPasswordMutation.isPending}><KeyRound className="h-4 w-4" />حفظ كلمة حماية الفرع</Button><p className="mt-3 text-xs font-bold text-slate-400">كلمة مرور المالك تتغير من زر «كلمة المرور» أعلى لوحة الطلبات.</p></Card>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleBranches.map(branch => <Card key={branch.id} className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold text-sky-600">{branch.code}</p><h2 className="mt-1 text-xl font-black">{branch.name}</h2><p className="mt-2 text-sm text-slate-500">{branch.settings?.address || "لم يضاف العنوان"}</p></div><Switch checked={branch.isActive} onCheckedChange={isActive => updateBranch.mutateAsync({ id: branch.id, isActive }).then(refresh)} /></div><Button variant="outline" className="mt-5 w-full" onClick={() => setSelectedBranchId(branch.id)}><Store className="h-4 w-4" />إعدادات الفرع</Button></Card>)}
            </div>
            <Card className="p-5"><h2 className="text-lg font-black">إضافة فرع جديد</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><Field label="اسم الفرع"><Input value={branchForm.name} onChange={event => setBranchForm({ ...branchForm, name: event.target.value })} /></Field><Field label="الرابط المختصر بالإنجليزية"><Input value={branchForm.slug} onChange={event => setBranchForm({ ...branchForm, slug: event.target.value })} dir="ltr" /></Field><Field label="رمز الفرع"><Input value={branchForm.code} onChange={event => setBranchForm({ ...branchForm, code: event.target.value })} dir="ltr" /></Field></div><Button className="mt-4" onClick={handleCreateBranch} disabled={createBranch.isPending}><Plus className="h-4 w-4" />إضافة الفرع</Button></Card>
            {selectedBranch && <Card className="p-5"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold text-sky-600">إعدادات قابلة للتعديل</p><h2 className="text-xl font-black">{selectedBranch.name}</h2></div><Button variant="outline" onClick={() => setSelectedBranchId(null)}>إغلاق</Button></div><div className="grid gap-4 md:grid-cols-2"><Field label="الاسم الظاهر"><Input value={settingsForm.displayName} onChange={event => setSettingsForm({ ...settingsForm, displayName: event.target.value })} /></Field><Field label="بادئة الفاتورة"><Input value={settingsForm.invoicePrefix} onChange={event => setSettingsForm({ ...settingsForm, invoicePrefix: event.target.value })} /></Field><Field label="رقم الاتصال"><Input value={settingsForm.phone} onChange={event => setSettingsForm({ ...settingsForm, phone: event.target.value })} dir="ltr" /></Field><Field label="رقم واتساب"><Input value={settingsForm.whatsappPhone} onChange={event => setSettingsForm({ ...settingsForm, whatsappPhone: event.target.value })} dir="ltr" /></Field><Field label="رابط Google Maps"><Input value={settingsForm.mapUrl} onChange={event => setSettingsForm({ ...settingsForm, mapUrl: event.target.value })} dir="ltr" /></Field><Field label="رابط تقييم Google"><Input value={settingsForm.mapsReviewUrl} onChange={event => setSettingsForm({ ...settingsForm, mapsReviewUrl: event.target.value })} dir="ltr" /></Field><div className="md:col-span-2"><Field label="العنوان"><Textarea value={settingsForm.address} onChange={event => setSettingsForm({ ...settingsForm, address: event.target.value })} /></Field></div><Field label="أوقات العمل"><Textarea value={settingsForm.openingHours} onChange={event => setSettingsForm({ ...settingsForm, openingHours: event.target.value })} /></Field><Field label="سياسة الضمان"><Textarea value={settingsForm.warrantyPolicy} onChange={event => setSettingsForm({ ...settingsForm, warrantyPolicy: event.target.value })} /></Field><div className="flex items-center justify-between rounded-xl border p-4"><span className="font-bold">شاشة الانتظار</span><Switch checked={settingsForm.waitingScreenEnabled} onCheckedChange={waitingScreenEnabled => setSettingsForm({ ...settingsForm, waitingScreenEnabled })} /></div><div className="flex items-center justify-between rounded-xl border p-4"><span className="font-bold">واتساب الآلي</span><Switch checked={settingsForm.whatsappEnabled} onCheckedChange={whatsappEnabled => setSettingsForm({ ...settingsForm, whatsappEnabled })} /></div></div><Button className="mt-5" onClick={handleSaveBranchSettings}><Save className="h-4 w-4" />حفظ إعدادات الفرع</Button></Card>}
          </TabsContent>

          <TabsContent value="staff" className="space-y-6">
            {temporaryCredential && <Card className="border-amber-200 bg-amber-50 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black text-amber-950">بيانات الدخول المبدئية — انسخها الآن</p><p className="mt-1 text-xs font-bold text-amber-800">الكلمة المبدئية تبقى صالحة حتى تغيّرها من بطاقة الموظف.</p><p className="mt-2 font-mono text-sm" dir="ltr">{temporaryCredential.username} / {temporaryCredential.password}</p></div><Button variant="outline" onClick={() => navigator.clipboard.writeText(`${temporaryCredential.username}\n${temporaryCredential.password}`).then(() => toast.success("تم النسخ"))}><ClipboardCopy className="h-4 w-4" />نسخ</Button></div></Card>}
            <Card className="p-5"><h2 className="text-xl font-black">إنشاء حساب موظف</h2><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Field label="الفرع"><Select value={staffForm.branchId} onValueChange={value => setStaffForm({ ...staffForm, branchId: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{activeBranches.map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select></Field><Field label="اسم الموظف"><Input value={staffForm.name} onChange={event => setStaffForm({ ...staffForm, name: event.target.value })} /></Field><Field label="اسم الدخول"><Input value={staffForm.username} onChange={event => setStaffForm({ ...staffForm, username: event.target.value })} dir="ltr" /></Field><Field label="الجوال"><Input value={staffForm.phone} onChange={event => setStaffForm({ ...staffForm, phone: event.target.value })} dir="ltr" /></Field><Field label="المسمى الوظيفي"><Input value={staffForm.jobTitle} onChange={event => setStaffForm({ ...staffForm, jobTitle: event.target.value })} /></Field></div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(permissionLabels).map(([key, label]) => <label key={key} className="flex items-center justify-between rounded-xl border bg-white p-3 text-sm font-bold"><span>{label}</span><Switch checked={staffForm.permissions.includes(key as PermissionKey)} onCheckedChange={checked => setStaffForm(form => ({ ...form, permissions: checked ? [...form.permissions, key as PermissionKey] : form.permissions.filter(permission => permission !== key) }))} /></label>)}</div><Button className="mt-5" onClick={handleCreateStaff} disabled={createStaff.isPending}><Plus className="h-4 w-4" />إنشاء الموظف</Button></Card>
            <div className="grid gap-4 lg:grid-cols-2">
              {staffQuery.data?.map(staff => {
                const currentBranch = transferBranches.find(branch => branch.id === staff.branchId);
                return <Card key={staff.id} className="p-5">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-black">{staff.name}</h3><p className="text-sm text-slate-500">{staff.username} · {staff.jobTitle || "موظف"}</p><p className="mt-2 inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-800"><MapPin className="h-3.5 w-3.5" />الفرع الحالي: {currentBranch?.name ?? `فرع #${staff.branchId}`}</p></div><Badge variant={staff.isActive ? "default" : "secondary"}>{staff.isActive ? "نشط" : "موقوف"}</Badge></div>
                  <div className="mt-4 flex flex-wrap gap-2">{staff.permissionsList.map(permission => <Badge key={permission} variant="outline">{permissionLabels[permission]}</Badge>)}</div>
                  <StaffProfileEditor staff={staff} saving={updateStaff.isPending} onSave={handleUpdateStaffProfile} />
                  <StaffPermissionsEditor staffId={staff.id} permissions={staff.permissionsList} saving={updateStaff.isPending} onSave={async (id, permissions) => { await updateStaff.mutateAsync({ id, permissions }); toast.success("تم حفظ صلاحيات الموظف"); await refresh(); }} />
                  <StaffPasswordEditor staffId={staff.id} staffName={staff.name} saving={setStaffPasswordMutation.isPending} onSave={handleSetStaffPassword} />
                  <StaffBranchTransfer staffId={staff.id} staffName={staff.name} currentBranchId={staff.branchId} branches={transferBranches} saving={transferStaffMutation.isPending} onTransfer={handleTransferStaff} />
                  <div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" className={staff.isActive ? "text-red-700" : "text-emerald-700"} onClick={() => updateStaff.mutateAsync({ id: staff.id, isActive: !staff.isActive }).then(refresh)}>{staff.isActive ? "إيقاف" : "تفعيل"}</Button><Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => handleRemoveStaff(staff.id, staff.name)} disabled={removeStaffMutation.isPending}><Trash2 className="h-4 w-4" />حذف الحساب</Button></div>
                </Card>;
              })}
            </div>
          </TabsContent>

          <TabsContent value="messages" className="space-y-6">
            <PopupCategoryControls branchId={branchId} />
            <Card className="p-5"><h2 className="text-xl font-black">إضافة رسالة عشوائية</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><Field label="الفرع"><Select value={popupForm.branchId} onValueChange={value => setPopupForm({ ...popupForm, branchId: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">جميع الفروع</SelectItem>{activeBranches.map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select></Field><Field label="المرحلة"><Select value={popupForm.category} onValueChange={value => setPopupForm({ ...popupForm, category: value as PopupCategory })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(categoryLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="وزن الظهور"><Input type="number" min="1" max="20" value={popupForm.weight} onChange={event => setPopupForm({ ...popupForm, weight: event.target.value })} /></Field><div className="md:col-span-3"><Field label="نص الرسالة"><Textarea value={popupForm.message} onChange={event => setPopupForm({ ...popupForm, message: event.target.value })} /></Field></div></div><Button className="mt-4" onClick={handleCreatePopup}><Plus className="h-4 w-4" />إضافة الرسالة</Button></Card>
            <div className="grid gap-3 lg:grid-cols-2">{popupsQuery.data?.map(message => <PopupMessageEditor key={message.id} message={message} branches={activeBranches} onSave={async input => { await updatePopup.mutateAsync(input); toast.success("تم حفظ تعديلات الرسالة"); await refresh(); }} onDelete={async id => { await deletePopup.mutateAsync({ id }); toast.success("تم حذف الرسالة"); await refresh(); }} />)}</div>
          </TabsContent>

          <TabsContent value="scratch">
            <ScratchAdminPanel selectedBranchId={branchId} branches={branchesQuery.data ?? []} />
          </TabsContent>

          <TabsContent value="content" className="space-y-6">
            <Card className="p-5">
              <h2 className="text-xl font-black">إدارة نصوص الموقع</h2>
              <p className="mt-2 text-sm text-slate-500">عدّل أي كلمة أو عبارة على الموقع من هنا، والتغييرات تظهر فوراً</p>
            </Card>
            <SiteContentEditor branchId={branchId} />
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-6">
            <Card className="border-amber-200 bg-amber-50 p-5"><h2 className="font-black text-amber-950">الربط الرسمي مؤجل حسب طلبك</h2><p className="mt-2 text-sm leading-7 text-amber-800">النظام يحفظ كل رسالة وقالب حسب الفرع. حاليًا تفتح الرسالة يدويًا في واتساب، وعند إضافة بيانات Meta لاحقًا يتحول نفس السجل إلى إرسال آلي دون إعادة بناء المنصة.</p></Card>
            <section><div className="mb-4"><h2 className="text-xl font-black">قوالب واتساب</h2><p className="text-sm text-slate-500">عدّل النصوص الآن، وأضف اسم قالب Meta بعد اعتماده مستقبلًا.</p></div><div className="grid gap-4 lg:grid-cols-2">{whatsappTemplatesQuery.data?.map(template => <WhatsAppTemplateEditor key={template.id} template={template} onSave={async input => { await updateWhatsappTemplate.mutateAsync(input); toast.success("تم حفظ قالب واتساب"); await refresh(); }} />)}</div></section>
            <section><div className="mb-4"><h2 className="text-xl font-black">قائمة الرسائل</h2><p className="text-sm text-slate-500">آخر 200 رسالة، ويمكن فتحها وإرسالها يدويًا حتى ربط Meta.</p></div><div className="grid gap-3">{whatsappQueueQuery.data?.length ? whatsappQueueQuery.data.map(message => <Card key={message.id} className="p-4"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge>{message.eventType}</Badge><Badge variant={message.status === "sent" ? "default" : "outline"}>{message.status === "sent" ? "تم الإرسال" : "بانتظار الإرسال"}</Badge>{message.orderBarcode && <span className="text-xs font-bold text-sky-700">طلب #{message.orderBarcode}</span>}</div><p className="mt-3 font-bold">{message.customerName || message.recipient}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{message.message}</p><time className="mt-2 block text-xs text-slate-400">{new Date(message.createdAt).toLocaleString("ar-SA")}</time></div><div className="flex shrink-0 flex-wrap gap-2"><a href={message.manualUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-500 px-4 text-sm font-bold text-white hover:bg-emerald-600"><Send className="h-4 w-4" />فتح واتساب</a>{message.status !== "sent" && <Button variant="outline" onClick={() => markWhatsappManualSent.mutateAsync({ id: message.id }).then(async () => { toast.success("تم تسجيل الإرسال اليدوي"); await refresh(); })}>تأكيد تم الإرسال</Button>}</div></div></Card>) : <Card className="p-8 text-center text-slate-500">لا توجد رسائل معلقة حاليًا.</Card>}</div></section>
          </TabsContent>

          <TabsContent value="audit" className="space-y-6"><BackupAdminPanel /><Card className="overflow-hidden"><div className="border-b p-5"><h2 className="text-xl font-black">سجل العمليات</h2><p className="text-sm text-slate-500">آخر 100 عملية مع نوع الفاعل والفرع والوقت، وبصمة سلامة تكشف أي تعديل غير مصرح به.</p></div><div className="divide-y">{auditQuery.data?.map(log => <div key={log.id} className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_1fr_1fr_auto_auto]"><strong>{log.action}</strong><span className="text-slate-600">{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</span><span className="text-slate-600">{log.actorType}{log.actorId ? ` #${log.actorId}` : ""}</span><Badge variant={log.integrityStatus === "verified" ? "default" : log.integrityStatus === "tampered" ? "destructive" : "outline"}>{log.integrityStatus === "verified" ? "البصمة سليمة" : log.integrityStatus === "tampered" ? "تنبيه: تعديل مكتشف" : "سجل قديم"}</Badge><time className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString("ar-SA")}</time></div>)}</div></Card></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
