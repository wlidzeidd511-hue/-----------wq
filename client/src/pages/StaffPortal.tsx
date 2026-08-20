import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Camera, ClipboardList, KeyRound, Loader2, LogOut, PackageCheck, Plus, Printer, Save, Search } from "lucide-react";
import { IntakePhotoPicker } from "@/components/IntakePhotoPicker";
import { CreatePriceApprovalOption } from "@/components/CreatePriceApprovalOption";
import { StaffInternalAlertsPanel } from "@/components/InternalAlertsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { readIntakePhotoAsDataUrl } from "@/lib/intakePhotos";
import { formatWarrantyYears, hoursInputToMinutes, minutesToHoursInput, warrantyDaysToYearsInput, warrantyYearsInputToDays } from "@/lib/serviceUnits";
import { OWNER_LOGIN_PATH } from "@/ownerPortal";
import { STORE_APP_ICON_URL, STORE_LOGO_URL } from "@shared/siteConfig";
import { toast } from "sonner";

const statusLabels = {
  pending: "تم الاستلام",
  diagnosing: "قيد الفحص",
  awaiting_approval: "بانتظار الموافقة",
  in_progress: "جاري العمل",
  ready: "جاهز",
  delivered: "تم التسليم",
  cancelled: "ملغي",
} as const;

const permissionLabels: Record<string, string> = {
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
  "alerts.create": "إضافة التنبيهات والقطع الناقصة",
  "alerts.update": "تحديث حالة التنبيهات",
  "alerts.delete": "حذف التنبيهات إلى سلة المحذوفات",
};

const emptyForm = {
  serviceType: "maintenance" as "maintenance" | "programming",
  customerName: "",
  customerPhone: "",
  deviceInfo: "",
  reportedIssue: "",
  deviceBrand: "",
  deviceModel: "",
  serialNumber: "",
  receivedAccessories: "",
  intakeCondition: "",
  customerVisibleNotes: "",
  deviceLocation: "",
  price: "",
  cost: "",
  amountPaid: "",
  estimatedHours: "",
  warrantyYears: "سنة واحدة",
};

type StaffForm = typeof emptyForm;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2"><span className="block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}

function cents(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

export default function StaffPortal() {
  const utils = trpc.useUtils();
  const meQuery = trpc.accounts.staff.me.useQuery(undefined, {
    retry: false,
    refetchInterval: 2_500,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const authenticated = Boolean(meQuery.data?.authenticated);
  const branchesQuery = trpc.platform.branches.publicList.useQuery(undefined, { enabled: authenticated, retry: false });
  const summaryQuery = trpc.staff.summary.useQuery(undefined, { enabled: authenticated && Boolean(meQuery.data?.staff?.permissionsList.includes("orders.view_branch")), retry: false, refetchInterval: 10_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
  const [search, setSearch] = useState("");
  const [customerLookupInput, setCustomerLookupInput] = useState("");
  const [customerLookupPhone, setCustomerLookupPhone] = useState("");
  const ordersQuery = trpc.staff.orders.list.useQuery(
    { search: search.trim() || undefined, archived: false },
    { enabled: authenticated && Boolean(meQuery.data?.staff?.permissionsList.includes("orders.view_branch")), retry: false, refetchInterval: 5_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true },
  );
  const customerLookupQuery = trpc.staff.customers.searchByPhone.useQuery(
    { phone: customerLookupPhone },
    { enabled: authenticated && Boolean(meQuery.data?.staff?.permissionsList.includes("customers.view")) && customerLookupPhone.length >= 8, retry: false },
  );
  const [login, setLogin] = useState({ username: "", password: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [intakePhotos, setIntakePhotos] = useState<File[]>([]);
  const [createProgress, setCreateProgress] = useState<string | null>(null);
  const [requestApprovalOnCreate, setRequestApprovalOnCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detailQuery = trpc.staff.orders.get.useQuery(
    { id: selectedId ?? 1 },
    { enabled: authenticated && Boolean(meQuery.data?.staff?.permissionsList.includes("orders.view_branch")) && selectedId !== null, retry: false, refetchInterval: selectedId !== null ? 4_000 : false, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  );
  const [editForm, setEditForm] = useState<StaffForm>(emptyForm);
  const [editDirty, setEditDirty] = useState(false);
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoVisible, setPhotoVisible] = useState(false);
  const [temporaryCredential, setTemporaryCredential] = useState<string | null>(null);

  const loginMutation = trpc.accounts.staff.login.useMutation();
  const logoutMutation = trpc.accounts.staff.logout.useMutation();
  const createMutation = trpc.staff.orders.create.useMutation();
  const updateMutation = trpc.staff.orders.updateIntake.useMutation();
  const statusMutation = trpc.staff.orders.updateStatus.useMutation();
  const uploadMutation = trpc.staff.orders.uploadPhoto.useMutation();

  useEffect(() => {
    setEditDirty(false);
    setEditVersion(null);
  }, [selectedId]);

  useEffect(() => {
    const order = detailQuery.data?.order;
    if (!order || editDirty) return;
    setEditForm({
      serviceType: order.serviceType,
      customerName: order.customerName ?? "",
      customerPhone: order.customerPhone ?? "",
      deviceInfo: order.deviceInfo,
      reportedIssue: order.reportedIssue ?? "",
      deviceBrand: order.deviceBrand ?? "",
      deviceModel: order.deviceModel ?? "",
      serialNumber: order.serialNumber ?? "",
      receivedAccessories: order.receivedAccessories ?? "",
      intakeCondition: order.intakeCondition ?? "",
      customerVisibleNotes: order.customerVisibleNotes ?? "",
      deviceLocation: order.deviceLocation ?? "",
      price: String(order.price / 100),
      cost: String((order.cost ?? 0) / 100),
      amountPaid: String(order.amountPaid / 100),
      estimatedHours: minutesToHoursInput(order.estimatedTime),
      warrantyYears: warrantyDaysToYearsInput(order.warrantyDays),
    });
    setEditVersion(new Date(order.updatedAt).getTime());
  }, [detailQuery.data, editDirty]);

  const staff = meQuery.data?.staff;
  const staffBranch = branchesQuery.data?.find(branch => branch.id === staff?.branchId);
  const orders = ordersQuery.data ?? [];
  const canViewOrders = staff?.permissionsList.includes("orders.view_branch") ?? false;
  const canCreate = staff?.permissionsList.includes("orders.create") ?? false;
  const canUpdate = staff?.permissionsList.includes("orders.update_intake") ?? false;
  const canUpdateStatus = staff?.permissionsList.includes("orders.update_status") ?? false;
  const canViewPrices = staff?.permissionsList.includes("orders.view_prices") ?? false;
  const canViewInternalNotes = staff?.permissionsList.includes("orders.view_internal_notes") ?? false;
  const canViewCustomers = staff?.permissionsList.includes("customers.view") ?? false;
  const canUpload = staff?.permissionsList.includes("photos.upload") ?? false;
  const canViewPhotos = staff?.permissionsList.includes("photos.view") ?? false;
  const canViewAlerts = staff?.permissionsList.includes("alerts.view") ?? false;
  const canCreateAlerts = staff?.permissionsList.includes("alerts.create") ?? false;
  const canUpdateAlerts = staff?.permissionsList.includes("alerts.update") ?? false;
  const canDeleteAlerts = staff?.permissionsList.includes("alerts.delete") ?? false;

  async function refresh() {
    await Promise.all([
      utils.accounts.staff.me.invalidate(),
      utils.staff.summary.invalidate(),
      utils.staff.orders.list.invalidate(),
      selectedId ? utils.staff.orders.get.invalidate({ id: selectedId }) : Promise.resolve(),
    ]);
  }

  async function handleLogin() {
    try {
      await loginMutation.mutateAsync(login);
      setLogin({ username: "", password: "" });
      await refresh();
    } catch {
      toast.error("بيانات دخول الموظف غير صحيحة");
    }
  }

  async function handleCreate() {
    if (!form.customerName.trim() || !form.customerPhone.trim() || !form.deviceInfo.trim()) return toast.error("أكمل بيانات العميل والجهاز");
    if (canViewPrices && requestApprovalOnCreate && cents(form.price) <= 0) return toast.error("أدخل سعرًا أكبر من صفر لإرسال موافقة السعر");
    const estimatedTime = hoursInputToMinutes(form.estimatedHours, -1);
    const warrantyDays = warrantyYearsInputToDays(form.warrantyYears, -1);
    if (estimatedTime < 0) return toast.error("اكتب المدة بوضوح مثل: 90 دقيقة، ساعتين، يوم ونص أو أسبوعين");
    if (warrantyDays < 0) return toast.error("اكتب الضمان بوضوح مثل: 30 يوم، 6 شهور، سنة ونص أو سنتين");
    if (warrantyDays > 3650) return toast.error("مدة الضمان القصوى 10 سنوات");
    try {
      setCreateProgress("جاري إنشاء الفاتورة...");
      const result = await createMutation.mutateAsync({
        serviceType: form.serviceType,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        deviceInfo: form.deviceInfo.trim(),
        reportedIssue: form.reportedIssue.trim() || undefined,
        deviceBrand: form.deviceBrand.trim() || undefined,
        deviceModel: form.deviceModel.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        receivedAccessories: form.receivedAccessories.trim() || undefined,
        intakeCondition: form.intakeCondition.trim() || undefined,
        customerVisibleNotes: form.customerVisibleNotes.trim() || undefined,
        deviceLocation: form.deviceLocation.trim() || undefined,
        price: canViewPrices ? cents(form.price) : 0,
        cost: canViewPrices ? cents(form.cost) : 0,
        amountPaid: canViewPrices ? cents(form.amountPaid) : 0,
        estimatedTime,
        warrantyDays,
        requestPriceApproval: canViewPrices && requestApprovalOnCreate,
      });

      let uploadedCount = 0;
      const failedPhotos: number[] = [];
      if (canUpload) {
        for (let index = 0; index < intakePhotos.length; index += 1) {
          setCreateProgress(`جاري حفظ صورة الجهاز ${index + 1} من ${intakePhotos.length}...`);
          try {
            await uploadMutation.mutateAsync({
              orderId: result.order.id,
              dataUrl: await readIntakePhotoAsDataUrl(intakePhotos[index]),
              caption: `قبل الصيانة ${index + 1}`,
              visibleToCustomer: false,
            });
            uploadedCount += 1;
          } catch {
            failedPhotos.push(index + 1);
          }
        }
      }
      if (result.customerAccountCreated && result.temporaryPassword) {
        setTemporaryCredential(`رقم العميل: ${form.customerPhone}\nكلمة المرور المؤقتة: ${result.temporaryPassword}`);
      }
      setForm(emptyForm);
      setIntakePhotos([]);
      setRequestApprovalOnCreate(false);
      setCreateOpen(false);
      toast.success(`تم إنشاء الطلب #${result.order.barcode}${uploadedCount ? ` وحفظ ${uploadedCount} ${uploadedCount === 1 ? "صورة" : "صور"}` : ""}${requestApprovalOnCreate ? " وطلب موافقة السعر" : ""}`);
      if (failedPhotos.length) toast.warning(`تم حفظ الفاتورة، وتعذر رفع ${failedPhotos.length} من الصور. يمكنك إعادة رفعها من بيانات الاستلام.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء الطلب");
    } finally {
      setCreateProgress(null);
    }
  }

  async function handleUpdate() {
    if (!selectedId) return;
    const estimatedTime = hoursInputToMinutes(editForm.estimatedHours, -1);
    const warrantyDays = warrantyYearsInputToDays(editForm.warrantyYears, -1);
    if (estimatedTime < 0) return toast.error("اكتب المدة بوضوح مثل: 90 دقيقة، ساعتين، يوم ونص أو أسبوعين");
    if (warrantyDays < 0) return toast.error("اكتب الضمان بوضوح مثل: 30 يوم، 6 شهور، سنة ونص أو سنتين");
    if (warrantyDays > 3650) return toast.error("مدة الضمان القصوى 10 سنوات");
    try {
      await updateMutation.mutateAsync({
        id: selectedId,
        customerName: editForm.customerName || null,
        customerPhone: editForm.customerPhone || null,
        deviceInfo: editForm.deviceInfo || undefined,
        reportedIssue: editForm.reportedIssue || null,
        deviceBrand: editForm.deviceBrand || null,
        deviceModel: editForm.deviceModel || null,
        serialNumber: editForm.serialNumber || null,
        receivedAccessories: editForm.receivedAccessories || null,
        intakeCondition: editForm.intakeCondition || null,
        customerVisibleNotes: editForm.customerVisibleNotes || null,
        deviceLocation: editForm.deviceLocation || null,
        ...(canViewPrices ? {
          price: cents(editForm.price),
          cost: cents(editForm.cost),
          amountPaid: cents(editForm.amountPaid),
        } : {}),
        estimatedTime,
        warrantyDays,
        expectedUpdatedAt: editVersion ?? undefined,
      });
      setEditDirty(false);
      toast.success("تم حفظ بيانات الاستلام ومكان الجهاز");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ بيانات الفاتورة");
    }
  }

  async function handleStatus(orderId: number, status: keyof typeof statusLabels) {
    try {
      await statusMutation.mutateAsync({ id: orderId, status, visibleToCustomer: true });
      toast.success(`تم تحديث الحالة إلى: ${statusLabels[status]}`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث حالة الفاتورة");
    }
  }

  async function handlePhoto(file: File) {
    if (!selectedId) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) return toast.error("اختر صورة JPG أو PNG أو WebP");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    await uploadMutation.mutateAsync({
      orderId: selectedId,
      dataUrl,
      caption: photoCaption.trim() || undefined,
      visibleToCustomer: photoVisible,
    });
    setPhotoCaption("");
    toast.success("تم رفع الصورة وتسجيل الموظف المصور");
    await refresh();
  }

  if (meQuery.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-sky-500" /></div>;

  if (!authenticated) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4" dir="rtl"><Card className="w-full max-w-md p-6 shadow-xl"><a href={OWNER_LOGIN_PATH} className="mb-2 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-sky-50 hover:text-sky-700"><ArrowRight className="h-4 w-4" />رجوع لاختيار نوع الحساب</a><img src={STORE_LOGO_URL} alt="الشعار الرسمي لهاتف التميز للاتصالات" className="mx-auto h-28 w-40 object-contain drop-shadow-md" /><h1 className="mt-4 text-center text-2xl font-black">دخول الموظفين</h1><p className="mt-2 text-center text-sm text-slate-500">استخدم اسم الدخول وكلمة المرور التي أصدرها المالك. الفرع والصلاحيات تُحدد من لوحة المالك تلقائيًا.</p><div className="mt-6 space-y-4"><Field label="اسم الدخول"><Input value={login.username} onChange={event => setLogin({ ...login, username: event.target.value })} dir="ltr" autoComplete="username" /></Field><Field label="كلمة المرور"><Input type="password" value={login.password} onChange={event => setLogin({ ...login, password: event.target.value })} onKeyDown={event => event.key === "Enter" && handleLogin()} autoComplete="current-password" /></Field><Button onClick={handleLogin} disabled={loginMutation.isPending} className="w-full bg-sky-500 font-bold text-white hover:bg-sky-600">{loginMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}دخول الموظف</Button></div></Card></main>;
  }

  return <div className="min-h-screen bg-slate-50" dir="rtl">
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur-xl"><div className="container flex min-h-20 flex-wrap items-center justify-between gap-3 py-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white p-0.5 shadow-sm ring-1 ring-sky-100"><img src={STORE_APP_ICON_URL} alt="الشعار الرسمي لهاتف التميز" className="h-full w-full object-contain" /></span><div><h1 className="text-xl font-black">مساحة الموظف</h1><p className="text-xs font-bold text-slate-600">{staff?.name} · {staffBranch?.name ?? `فرع #${staff?.branchId ?? "—"}`}</p></div></div><Button variant="outline" onClick={() => logoutMutation.mutateAsync().then(() => utils.accounts.staff.me.invalidate())}><LogOut className="h-4 w-4" />خروج</Button></div></header>
    <main className="container space-y-6 py-7">
      <Card className="border-sky-200 bg-sky-50/70 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black text-sky-700">حساب الموظف الحالي</p><h2 className="mt-1 text-xl font-black text-slate-950">{staff?.name}</h2><p className="mt-1 text-sm font-bold text-slate-600">الفرع المعيّن: {staffBranch?.name ?? `فرع #${staff?.branchId ?? "—"}`}</p></div><Badge className="bg-white text-sky-800 ring-1 ring-sky-200">موظف</Badge></div><div className="mt-4 flex flex-wrap gap-2">{staff?.permissionsList.map(permission => <Badge key={permission} variant="outline" className="bg-white">{permissionLabels[permission] ?? permission}</Badge>)}</div><p className="mt-3 text-xs font-bold leading-5 text-slate-500">تظهر لك الأدوات الموافقة لهذه الصلاحيات فقط. تغيير الفرع أو الصلاحيات يتم من المالك ويُنهي الجلسة القديمة عند النقل.</p></Card>
      {canViewAlerts && staff && <StaffInternalAlertsPanel canCreate={canCreateAlerts} canUpdate={canUpdateAlerts} canDelete={canDeleteAlerts} branchId={staff.branchId} branchName={staffBranch?.name ?? `فرع #${staff.branchId}`} />}
      {canViewCustomers && <Card className="border-sky-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1"><Field label="بحث عن عميل برقم الجوال"><Input value={customerLookupInput} onChange={event => setCustomerLookupInput(event.target.value)} placeholder="05xxxxxxxx" dir="ltr" onKeyDown={event => { if (event.key === "Enter" && customerLookupInput.trim().length >= 8) setCustomerLookupPhone(customerLookupInput.trim()); }} /></Field></div>
          <Button type="button" variant="outline" className="h-10 border-sky-200 bg-sky-50 font-bold text-sky-800" disabled={customerLookupInput.trim().length < 8 || customerLookupQuery.isFetching} onClick={() => setCustomerLookupPhone(customerLookupInput.trim())}>{customerLookupQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}بحث العميل</Button>
        </div>
        {customerLookupPhone && !customerLookupQuery.isFetching && !customerLookupQuery.data?.customer && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-500">لا يوجد عميل بهذا الرقم داخل فرعك.</p>}
        {customerLookupQuery.data?.customer && <div className="mt-4 space-y-3"><div className="rounded-xl bg-sky-50 p-3"><p className="font-black text-slate-950">{customerLookupQuery.data.customer.name || "عميل بدون اسم"}</p><p className="text-sm font-bold text-slate-600" dir="ltr">{customerLookupQuery.data.customer.phoneDisplay}</p></div><div className="grid gap-2 sm:grid-cols-2">{customerLookupQuery.data.orders.map(order => <button key={order.id} type="button" onClick={() => setSelectedId(order.id)} className="rounded-xl border bg-white p-3 text-right transition hover:border-sky-300 hover:bg-sky-50"><div className="flex items-center justify-between gap-2"><strong className="text-sky-800">فاتورة #{order.barcode}</strong><Badge variant={order.archived ? "secondary" : "outline"}>{order.archived ? "مؤرشفة" : statusLabels[order.status] ?? order.status}</Badge></div><p className="mt-1 text-sm font-bold text-slate-700">{order.deviceInfo}</p><p className="mt-1 text-xs text-slate-500">الضمان: {formatWarrantyYears(order.warrantyDays)} · اضغط لفتح بيانات الاستلام</p></button>)}</div></div>}
      </Card>}
      {canViewOrders && <section className="grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-sm font-bold text-slate-500">طلبات الفرع</p><p className="mt-2 text-3xl font-black">{summaryQuery.data?.total ?? 0}</p></Card><Card className="p-5"><p className="text-sm font-bold text-slate-500">قيد العمل</p><p className="mt-2 text-3xl font-black text-sky-600">{summaryQuery.data?.active ?? 0}</p></Card><Card className="p-5"><p className="text-sm font-bold text-slate-500">جاهز</p><p className="mt-2 text-3xl font-black text-emerald-600">{summaryQuery.data?.ready ?? 0}</p></Card></section>}
      {temporaryCredential && <Card className="border-amber-200 bg-amber-50 p-5"><p className="font-black text-amber-950">بيانات حساب العميل المؤقتة</p><pre className="mt-2 whitespace-pre-wrap font-mono text-sm" dir="ltr">{temporaryCredential}</pre><Button size="sm" variant="outline" className="mt-3" onClick={() => navigator.clipboard.writeText(temporaryCredential).then(() => toast.success("تم النسخ"))}><KeyRound className="h-4 w-4" />نسخ</Button></Card>}
      <Card className="p-4"><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالطلب أو العميل أو الجهاز" className="pr-11" /></div>{canCreate && <Button onClick={() => setCreateOpen(true)} className="bg-sky-500 text-white"><Plus className="h-4 w-4" />فاتورة جديدة</Button>}</div></Card>
      {canViewOrders ? <div className="grid gap-3 lg:grid-cols-2">{orders.map(order => <Card key={order.id} className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-bold text-sky-600">طلب #{order.barcode}</p><h2 className="mt-1 font-black">{order.customerName || "بدون اسم"}</h2><p className="mt-1 text-sm text-slate-500">{order.deviceInfo}</p>{canViewPrices && <p className="mt-2 text-sm font-black text-emerald-700">السعر: {(order.price / 100).toFixed(2)} ر.س · المدفوع: {(order.amountPaid / 100).toFixed(2)} ر.س · التكلفة: {((order.cost ?? 0) / 100).toFixed(2)} ر.س</p>}<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[11px] font-black text-amber-700">مكان الجهاز — داخلي</p><p className="mt-1 whitespace-pre-wrap break-words text-sm font-black leading-6 text-amber-950">{order.deviceLocation || "غير محدد"}</p></div></div><Badge>{statusLabels[order.status] ?? order.status}</Badge></div>{canUpdateStatus && <Select value={order.status} onValueChange={value => void handleStatus(order.id, value as keyof typeof statusLabels)}><SelectTrigger className="mt-4 min-h-11 bg-white"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>}<Button variant="outline" className="mt-4 w-full" onClick={() => setSelectedId(order.id)}><ClipboardList className="h-4 w-4" />بيانات الاستلام والصور</Button></Card>)}</div> : <Card className="border-amber-200 bg-amber-50 p-5 text-center text-sm font-bold text-amber-900">لا توجد لديك صلاحية عرض طلبات الفرع.</Card>}
    </main>

    <Dialog open={createOpen} onOpenChange={open => { if (createProgress) return; setCreateOpen(open); if (!open) { setIntakePhotos([]); setRequestApprovalOnCreate(false); } }}><DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto bg-white" dir="rtl"><DialogHeader><DialogTitle className="text-2xl font-black">إنشاء فاتورة واستلام جهاز</DialogTitle><DialogDescription>نموذج واسع وواضح؛ تُنشأ هوية العميل تلقائيًا إذا كان رقمه جديدًا.</DialogDescription></DialogHeader><StaffOrderFields value={form} onChange={setForm} includeFinancials={canViewPrices} />{canUpload && <IntakePhotoPicker files={intakePhotos} onChange={setIntakePhotos} disabled={Boolean(createProgress)} />}{canViewPrices && <CreatePriceApprovalOption checked={requestApprovalOnCreate} onChange={setRequestApprovalOnCreate} price={form.price} customerPhone={form.customerPhone} disabled={Boolean(createProgress)} />}<Button onClick={handleCreate} disabled={Boolean(createProgress)} className="w-full bg-sky-500 font-bold text-white">{createProgress && <Loader2 className="h-4 w-4 animate-spin" />}{createProgress ?? (requestApprovalOnCreate ? "إنشاء وإرسال الموافقة" : "إنشاء الفاتورة")}</Button></DialogContent></Dialog>

    <Dialog open={selectedId !== null} onOpenChange={open => { if (!open && editDirty && !window.confirm("لديك تعديلات غير محفوظة. هل تريد الإغلاق دون حفظ؟")) return; if (!open) { setSelectedId(null); setEditDirty(false); } }}><DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto bg-white" dir="rtl"><DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2 text-2xl font-black">بيانات الاستلام ومكان الجهاز{editDirty && <Badge className="bg-amber-100 text-amber-900">تعديلات غير محفوظة</Badge>}</DialogTitle><DialogDescription>لا تظهر خانة مكان الجهاز للعميل.</DialogDescription></DialogHeader>{detailQuery.data?.order.publicToken && <Button data-testid="staff-invoice-print-button" type="button" onClick={() => window.open(`/invoice?t=${detailQuery.data.order.publicToken}`, "_blank", "noopener,noreferrer")} className="w-full bg-slate-950 text-base font-black text-white hover:bg-slate-800 sm:w-auto"><Printer className="h-5 w-5" />طباعة الفاتورة #{detailQuery.data.order.barcode}</Button>}{detailQuery.isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : <><StaffOrderFields value={editForm} onChange={value => { setEditForm(value); setEditDirty(true); }} includeFinancials={canViewPrices} />{canViewInternalNotes && detailQuery.data?.order.internalNotes && <Card className="border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black text-amber-700">ملاحظات المالك الداخلية</p><p className="mt-2 whitespace-pre-wrap text-sm font-bold text-amber-950">{detailQuery.data.order.internalNotes}</p></Card>}<div className="flex flex-wrap gap-3">{canUpdate && <Button onClick={handleUpdate} disabled={updateMutation.isPending || !editDirty}><Save className="h-4 w-4" />{editDirty ? "حفظ البيانات" : "محفوظ"}</Button>}{canUpload && <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-bold"><Camera className="h-4 w-4" />رفع صورة<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => event.target.files?.[0] && handlePhoto(event.target.files[0])} /></label>}</div>{canUpload && <div className="grid gap-3 sm:grid-cols-2"><Field label="وصف الصورة"><Input value={photoCaption} onChange={event => setPhotoCaption(event.target.value)} /></Field><label className="flex items-center gap-2 self-end rounded-xl border p-3 text-sm font-bold"><input type="checkbox" checked={photoVisible} onChange={event => setPhotoVisible(event.target.checked)} />تظهر للعميل</label></div>}{canViewPhotos && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{detailQuery.data?.photos.map(photo => <img key={photo.id} src={photo.url} alt={photo.caption || "صورة الجهاز"} className="aspect-square w-full rounded-xl object-cover" />)}</div>}</>}</DialogContent></Dialog>
  </div>;
}

function StaffOrderFields({ value, onChange, includeFinancials = false }: { value: StaffForm; onChange: (value: StaffForm) => void; includeFinancials?: boolean }) {
  const fields = useMemo(() => value, [value]);
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <Field label="نوع الخدمة"><Select value={fields.serviceType} onValueChange={serviceType => onChange({ ...fields, serviceType: serviceType as StaffForm["serviceType"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maintenance">صيانة</SelectItem><SelectItem value="programming">برمجة</SelectItem></SelectContent></Select></Field>
    <Field label="اسم العميل"><Input value={fields.customerName} onChange={event => onChange({ ...fields, customerName: event.target.value })} /></Field>
    <Field label="رقم الجوال"><Input value={fields.customerPhone} onChange={event => onChange({ ...fields, customerPhone: event.target.value })} dir="ltr" /></Field>
    <div className="sm:col-span-2"><Field label="معلومات الجهاز"><Input value={fields.deviceInfo} onChange={event => onChange({ ...fields, deviceInfo: event.target.value })} /></Field></div>
    <div className="sm:col-span-2 xl:col-span-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><Field label="مكان الجهاز داخليًا — لا يظهر للعميل"><Textarea className="min-h-24 border-amber-300 bg-white text-base font-bold leading-7" value={fields.deviceLocation} onChange={event => onChange({ ...fields, deviceLocation: event.target.value })} placeholder="عند ياسر / الرف الثاني / ناقص قطعة / يخلص بعد ساعة" /></Field></div>
    <div className="sm:col-span-2 xl:col-span-4"><Field label="العطل المبلّغ عنه"><Textarea value={fields.reportedIssue} onChange={event => onChange({ ...fields, reportedIssue: event.target.value })} placeholder="مثال: الشاشة لا تعمل / مدخل الشاحن" /></Field></div>
    <Field label="الشركة"><Input value={fields.deviceBrand} onChange={event => onChange({ ...fields, deviceBrand: event.target.value })} /></Field>
    <Field label="الموديل"><Input value={fields.deviceModel} onChange={event => onChange({ ...fields, deviceModel: event.target.value })} /></Field>
    <Field label="الرقم التسلسلي"><Input value={fields.serialNumber} onChange={event => onChange({ ...fields, serialNumber: event.target.value })} dir="ltr" /></Field>
    <Field label="الملحقات"><Input value={fields.receivedAccessories} onChange={event => onChange({ ...fields, receivedAccessories: event.target.value })} /></Field>
    <div className="sm:col-span-2"><Field label="حالة الجهاز عند الاستلام"><Textarea value={fields.intakeCondition} onChange={event => onChange({ ...fields, intakeCondition: event.target.value })} /></Field></div>
    <div className="sm:col-span-2"><Field label="ملاحظات تظهر للعميل"><Textarea value={fields.customerVisibleNotes} onChange={event => onChange({ ...fields, customerVisibleNotes: event.target.value })} /></Field></div>
    {includeFinancials && <><Field label="السعر (ريال)"><Input type="number" min="0" step="0.01" value={fields.price} onChange={event => onChange({ ...fields, price: event.target.value })} /></Field><Field label="المدفوع (ريال)"><Input type="number" min="0" step="0.01" value={fields.amountPaid} onChange={event => onChange({ ...fields, amountPaid: event.target.value })} /></Field><Field label="التكلفة (ريال)"><Input type="number" min="0" step="0.01" value={fields.cost} onChange={event => onChange({ ...fields, cost: event.target.value })} /></Field></>}
    <Field label="المدة المتوقعة"><Input value={fields.estimatedHours} onChange={event => onChange({ ...fields, estimatedHours: event.target.value })} placeholder="مثال: ساعتين، يوم ونص أو أسبوعين" /></Field>
    <Field label="الضمان"><Input value={fields.warrantyYears} onChange={event => onChange({ ...fields, warrantyYears: event.target.value })} placeholder="مثال: 6 شهور، سنة ونص أو سنتين" /></Field>
  </div>;
}
