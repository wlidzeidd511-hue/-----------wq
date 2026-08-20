import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { createPortal } from "react-dom";
import {
  Archive,
  ArchiveRestore,
  Banknote,
  BellRing,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  Edit3,
  Eye,
  FileText,
  ImagePlus,
  KeyRound,
  LockKeyhole,
  Loader2,
  LogOut,
  MessageCircle,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Trash2,
  UserRound,
  WalletCards,
  Wrench,
  XCircle,
} from "lucide-react";
import { ServiceBackdrop } from "@/components/ServiceBackdrop";
import { IntakePhotoPicker } from "@/components/IntakePhotoPicker";
import { CreatePriceApprovalOption } from "@/components/CreatePriceApprovalOption";
import { CustomerInvoiceLookup } from "@/components/CustomerInvoiceLookup";
import { AdditionalRepairOwnerPanel } from "@/components/AdditionalRepairOwnerPanel";
import { LoyaltyThresholdSettings, OwnerCustomerLoyaltyBadge } from "@/components/CustomerLoyalty";
import { RatingsAdminPanel } from "@/components/RatingsAdminPanel";
import { OwnerEngagementPanel } from "@/components/OwnerEngagementPanel";
import { ExportReportsPanel } from "@/components/ExportReportsPanel";
import { OwnerInternalAlertsPanel } from "@/components/InternalAlertsPanel";
import { OrderDirectMessageComposer } from "@/components/OrderDirectMessageComposer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { readIntakePhotoAsDataUrl } from "@/lib/intakePhotos";
import { hoursInputToMinutes, minutesToHoursInput, warrantyDaysToYearsInput, warrantyYearsInputToDays } from "@/lib/serviceUnits";
import { OWNER_LOGIN_PATH } from "@/ownerPortal";
import { buildPublicUrl, STORE_APP_ICON_URL } from "@shared/siteConfig";
import { toast } from "sonner";

const statuses = {
  pending: { label: "تم الاستلام", className: "bg-amber-50 text-amber-800 ring-amber-200", icon: PackageCheck },
  diagnosing: { label: "قيد الفحص", className: "bg-violet-50 text-violet-800 ring-violet-200", icon: Search },
  awaiting_approval: { label: "بانتظار الموافقة", className: "bg-orange-50 text-orange-800 ring-orange-200", icon: BellRing },
  in_progress: { label: "جاري العمل", className: "bg-sky-50 text-sky-800 ring-sky-200", icon: Wrench },
  ready: { label: "جاهز للاستلام", className: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: CheckCircle2 },
  delivered: { label: "تم التسليم", className: "bg-slate-100 text-slate-700 ring-slate-200", icon: ShieldCheck },
  cancelled: { label: "ملغي", className: "bg-red-50 text-red-800 ring-red-200", icon: XCircle },
} as const;

type StatusKey = keyof typeof statuses;

type FinancialReport = {
  total: number;
  active: number;
  ready: number;
  awaitingApproval: number;
  today: number;
  month: number;
  todayRevenue: number;
  todayCost: number;
  todayProfit: number;
  revenue: number;
  cost: number;
  profit: number;
  unpaid: number;
  averageInvoiceValue: number;
};

const emptyOrderForm = {
  serviceType: "maintenance" as "maintenance" | "programming",
  deviceInfo: "",
  reportedIssue: "",
  deviceBrand: "",
  deviceModel: "",
  serialNumber: "",
  receivedAccessories: "",
  intakeCondition: "",
  customerName: "",
  customerPhone: "",
  customerVisibleNotes: "",
  internalNotes: "",
  deviceLocation: "",
  price: "",
  cost: "",
  amountPaid: "",
  estimatedHours: "",
  warrantyYears: "سنة واحدة",
};

type OrderForm = typeof emptyOrderForm;

function cents(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function formatMoney(value: number, currency = "ر.س") {
  return `${(value / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDuration(milliseconds: number) {
  if (!milliseconds) return "لا توجد بيانات";
  const totalMinutes = Math.round(milliseconds / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} دقيقة`;
  const totalHours = totalMinutes / 60;
  if (totalHours < 24) return `${totalHours.toLocaleString("ar-SA", { maximumFractionDigits: 1 })} ساعة`;
  return `${(totalHours / 24).toLocaleString("ar-SA", { maximumFractionDigits: 1 })} يوم`;
}

function formatDate(value: Date | number | null | undefined) {
  if (!value) return "غير محدد";
  return new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function PriceApprovalStatusCard({ status, price, requestedAt, respondedAt, currency }: { status: string; price: number; requestedAt?: number | null; respondedAt?: number | null; currency: string }) {
  if (status === "not_required") return null;
  const state = status === "approved"
    ? { title: "وافق العميل على السعر", className: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 }
    : status === "rejected"
      ? { title: "رفض العميل السعر", className: "border-red-200 bg-red-50 text-red-900", icon: XCircle }
      : { title: "بانتظار موافقة العميل", className: "border-orange-200 bg-orange-50 text-orange-900", icon: BellRing };
  const Icon = state.icon;
  return <Card className={`p-4 ${state.className}`}><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/75"><Icon className="h-5 w-5" /></span><div><h3 className="font-black">{state.title}</h3><p className="mt-1 text-sm font-bold">السعر المطلوب: {formatMoney(price, currency)}</p>{requestedAt && <p className="mt-1 text-xs opacity-75">أُرسلت: {formatDate(requestedAt)}</p>}{respondedAt && <p className="mt-1 text-xs opacity-75">تم الرد: {formatDate(respondedAt)}</p>}</div></div></Card>;
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusKey | "all">("all");
  const [serviceFilter, setServiceFilter] = useState<"maintenance" | "programming" | "all">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [newOrderBranchId, setNewOrderBranchId] = useState("1");
  const [financialOpen, setFinancialOpen] = useState(false);
  const [financialPassword, setFinancialPassword] = useState("");
  const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [quickProposalOrderId, setQuickProposalOrderId] = useState<number | null>(null);
  const [photoOrderId, setPhotoOrderId] = useState<number | null>(null);
  const [orderForm, setOrderForm] = useState<OrderForm>(emptyOrderForm);
  const [intakePhotos, setIntakePhotos] = useState<File[]>([]);
  const [createProgress, setCreateProgress] = useState<string | null>(null);
  const [requestApprovalOnCreate, setRequestApprovalOnCreate] = useState(false);
  const [editForm, setEditForm] = useState<OrderForm>(emptyOrderForm);
  const [requestApproval, setRequestApproval] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const [shopForm, setShopForm] = useState({
    shopName: "هاتف التميز",
    subtitle: "للاتصالات",
    phone: "",
    whatsappPhone: "",
    address: "",
    mapUrl: "",
    openingHours: "",
    warrantyPolicy: "",
    currency: "ر.س",
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const sessionQuery = trpc.owner.me.useQuery(undefined, { retry: false });
  const authenticated = Boolean(sessionQuery.data?.authenticated);
  const branchAccessQuery = trpc.branchAccess.me.useQuery(undefined, { enabled: authenticated, retry: false });
  const branchAuthenticated = Boolean(branchAccessQuery.data?.authenticated);
  const selectedBranchId = branchAccessQuery.data?.authenticated ? branchAccessQuery.data.branch?.branchId : undefined;
  const branchesQuery = trpc.platform.branches.list.useQuery(undefined, { enabled: authenticated, retry: false });
  const filters = useMemo(
    () => ({
      branchId: selectedBranchId,
      search: searchText.trim() || undefined,
      status: statusFilter,
      serviceType: serviceFilter,
      archived: showArchived,
    }),
    [searchText, selectedBranchId, serviceFilter, showArchived, statusFilter],
  );
  const followUpFilters = useMemo(() => ({ archived: false as const }), []);
  const ordersQuery = trpc.orders.getAll.useQuery(filters, { enabled: authenticated && branchAuthenticated, retry: false, refetchInterval: 5_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const followUpOrdersQuery = trpc.orders.getAll.useQuery(followUpFilters, { enabled: authenticated && branchAuthenticated, retry: false, refetchInterval: 5_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const reportQuery = trpc.orders.report.useQuery(
    selectedBranchId ? { branchId: selectedBranchId } : undefined,
    { enabled: authenticated && branchAuthenticated, retry: false, refetchInterval: 15_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  );
  const overviewQuery = trpc.ownerMetrics.overview.useQuery(undefined, {
    enabled: authenticated && branchAuthenticated && Boolean(selectedBranchId),
    retry: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const pendingProposalsQuery = trpc.proposals.owner.pendingSummary.useQuery(undefined, {
    enabled: authenticated && branchAuthenticated,
    retry: false,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  const rawDetailQuery = trpc.orders.getById.useQuery(
    { id: selectedId ?? 1 },
    { enabled: authenticated && branchAuthenticated && selectedId !== null, retry: false, refetchInterval: selectedId !== null ? 4_000 : false, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  );
  const detailQuery = rawDetailQuery as typeof rawDetailQuery & {
    data: NonNullable<typeof rawDetailQuery.data>;
  };

  const createMutation = trpc.orders.create.useMutation();
  const statusMutation = trpc.orders.updateStatus.useMutation();
  const updateMutation = trpc.orders.updateDetails.useMutation();
  const archiveMutation = trpc.orders.archive.useMutation();
  const archiveManyMutation = trpc.orders.archiveMany.useMutation();
  const logoutMutation = trpc.owner.logout.useMutation();
  const lockBranchMutation = trpc.branchAccess.lock.useMutation();
  const settingsMutation = trpc.settings.update.useMutation();
  const passwordMutation = trpc.owner.changePassword.useMutation();
  const financialMutation = trpc.orders.financialReport.useMutation();
  const whatsappMutation = trpc.orders.prepareWhatsapp.useMutation();
  const uploadPhotoMutation = trpc.orders.uploadPhoto.useMutation();
  const photoVisibilityMutation = trpc.orders.setPhotoVisibility.useMutation();
  const deletePhotoMutation = trpc.orders.deletePhoto.useMutation();

  const settings = sessionQuery.data?.settings;
  const selectedBranchData = branchesQuery.data?.find(branch => branch.id === selectedBranchId);
  const currency = selectedBranchData?.settings?.currency ?? settings?.currency ?? "ر.س";

  useEffect(() => {
    if (sessionQuery.isError) navigate("/");
  }, [navigate, sessionQuery.isError]);

  useEffect(() => {
    if (authenticated && !branchAccessQuery.isLoading && !branchAuthenticated) navigate("/dashboard/branches");
  }, [authenticated, branchAccessQuery.isLoading, branchAuthenticated, navigate]);

  useEffect(() => {
    if (!settings) return;
    setShopForm({
      shopName: settings.shopName,
      subtitle: settings.subtitle,
      phone: settings.phone ?? "",
      whatsappPhone: settings.whatsappPhone ?? "",
      address: settings.address ?? "",
      mapUrl: settings.mapUrl ?? "",
      openingHours: settings.openingHours ?? "",
      warrantyPolicy: settings.warrantyPolicy ?? "",
      currency: settings.currency,
    });
  }, [settings]);

  useEffect(() => {
    setFinancialReport(null);
    if (selectedBranchId) setNewOrderBranchId(String(selectedBranchId));
  }, [selectedBranchId]);

  useEffect(() => {
    setEditDirty(false);
    setEditVersion(null);
  }, [selectedId]);

  useEffect(() => {
    const order = detailQuery.data?.order;
    if (!order || editDirty) return;
    setEditForm({
      serviceType: order.serviceType,
      deviceInfo: order.deviceInfo,
      reportedIssue: order.reportedIssue ?? "",
      deviceBrand: order.deviceBrand ?? "",
      deviceModel: order.deviceModel ?? "",
      serialNumber: order.serialNumber ?? "",
      receivedAccessories: order.receivedAccessories ?? "",
      intakeCondition: order.intakeCondition ?? "",
      customerName: order.customerName ?? "",
      customerPhone: order.customerPhone ?? "",
      customerVisibleNotes: order.customerVisibleNotes ?? "",
      internalNotes: order.internalNotes ?? "",
      deviceLocation: order.deviceLocation ?? "",
      price: String(order.price / 100),
      cost: String(order.cost / 100),
      amountPaid: String(order.amountPaid / 100),
      estimatedHours: minutesToHoursInput(order.estimatedTime),
      warrantyYears: warrantyDaysToYearsInput(order.warrantyDays),
    });
    setRequestApproval(false);
    setEditVersion(new Date(order.updatedAt).getTime());
  }, [detailQuery.data, editDirty]);

  async function refreshData() {
    await Promise.all([
      utils.orders.getAll.invalidate(),
      utils.orders.report.invalidate(),
      selectedId ? utils.orders.getById.invalidate({ id: selectedId }) : Promise.resolve(),
    ]);
  }

  async function handleCreate() {
    if (!orderForm.deviceInfo.trim()) return toast.error("أدخل معلومات الجهاز");
    if (requestApprovalOnCreate && !orderForm.customerPhone.trim()) return toast.error("أدخل رقم جوال العميل لإرسال موافقة السعر");
    if (requestApprovalOnCreate && cents(orderForm.price) <= 0) return toast.error("أدخل سعرًا أكبر من صفر لإرسال موافقة السعر");
    const estimatedTime = hoursInputToMinutes(orderForm.estimatedHours, -1);
    const warrantyDays = warrantyYearsInputToDays(orderForm.warrantyYears, -1);
    if (estimatedTime < 0) return toast.error("اكتب المدة بوضوح مثل: 90 دقيقة، ساعتين، يوم ونص أو أسبوعين");
    if (warrantyDays < 0) return toast.error("اكتب الضمان بوضوح مثل: 30 يوم، 6 شهور، سنة ونص أو سنتين");
    if (warrantyDays > 3650) return toast.error("مدة الضمان القصوى 10 سنوات");
    try {
      setCreateProgress("جاري إنشاء الطلب...");
      const result = await createMutation.mutateAsync({
        branchId: Number(newOrderBranchId),
        serviceType: orderForm.serviceType,
        deviceInfo: orderForm.deviceInfo.trim(),
        reportedIssue: orderForm.reportedIssue.trim() || undefined,
        deviceBrand: orderForm.deviceBrand.trim() || undefined,
        deviceModel: orderForm.deviceModel.trim() || undefined,
        serialNumber: orderForm.serialNumber.trim() || undefined,
        receivedAccessories: orderForm.receivedAccessories.trim() || undefined,
        intakeCondition: orderForm.intakeCondition.trim() || undefined,
        customerName: orderForm.customerName.trim() || undefined,
        customerPhone: orderForm.customerPhone.trim() || undefined,
        customerVisibleNotes: orderForm.customerVisibleNotes.trim() || undefined,
        internalNotes: orderForm.internalNotes.trim() || undefined,
        deviceLocation: orderForm.deviceLocation.trim() || undefined,
        price: cents(orderForm.price),
        cost: cents(orderForm.cost),
        amountPaid: cents(orderForm.amountPaid),
        estimatedTime,
        warrantyDays,
        requestPriceApproval: requestApprovalOnCreate,
      });

      let uploadedCount = 0;
      const failedPhotos: number[] = [];
      for (let index = 0; index < intakePhotos.length; index += 1) {
        setCreateProgress(`جاري حفظ صورة الجهاز ${index + 1} من ${intakePhotos.length}...`);
        try {
          await uploadPhotoMutation.mutateAsync({
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

      toast.success(`تم إنشاء الطلب رقم ${result.barcode}${uploadedCount ? ` وحفظ ${uploadedCount} ${uploadedCount === 1 ? "صورة" : "صور"}` : ""}${requestApprovalOnCreate ? " وطلب موافقة السعر" : ""}`);
      if (failedPhotos.length) toast.warning(`تم حفظ الطلب، وتعذر رفع ${failedPhotos.length} من الصور. يمكنك إعادة رفعها من قسم صور الجهاز.`);
      setCreateOpen(false);
      setOrderForm(emptyOrderForm);
      setIntakePhotos([]);
      setRequestApprovalOnCreate(false);
      await refreshData();
      setSelectedId(result.order.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء الطلب");
    } finally {
      setCreateProgress(null);
    }
  }

  async function handleStatus(id: number, status: StatusKey) {
    try {
      await statusMutation.mutateAsync({
        id,
        status,
        note: statuses[status].label,
        visibleToCustomer: true,
      });
      toast.success("تم تحديث الحالة وتسجيلها في الخط الزمني");
      await refreshData();
    } catch {
      toast.error("تعذر تحديث حالة الطلب");
    }
  }

  async function handleSaveDetails() {
    if (!selectedId || !editForm.deviceInfo.trim()) return;
    const estimatedTime = hoursInputToMinutes(editForm.estimatedHours, -1);
    const warrantyDays = warrantyYearsInputToDays(editForm.warrantyYears, -1);
    if (estimatedTime < 0) return toast.error("اكتب المدة بوضوح مثل: 90 دقيقة، ساعتين، يوم ونص أو أسبوعين");
    if (warrantyDays < 0) return toast.error("اكتب الضمان بوضوح مثل: 30 يوم، 6 شهور، سنة ونص أو سنتين");
    if (warrantyDays > 3650) return toast.error("مدة الضمان القصوى 10 سنوات");
    try {
      await updateMutation.mutateAsync({
        id: selectedId,
        deviceInfo: editForm.deviceInfo.trim(),
        reportedIssue: editForm.reportedIssue.trim() || null,
        deviceBrand: editForm.deviceBrand.trim() || null,
        deviceModel: editForm.deviceModel.trim() || null,
        serialNumber: editForm.serialNumber.trim() || null,
        receivedAccessories: editForm.receivedAccessories.trim() || null,
        intakeCondition: editForm.intakeCondition.trim() || null,
        customerName: editForm.customerName.trim() || null,
        customerPhone: editForm.customerPhone.trim() || null,
        customerVisibleNotes: editForm.customerVisibleNotes.trim() || null,
        internalNotes: editForm.internalNotes.trim() || null,
        deviceLocation: editForm.deviceLocation.trim() || null,
        price: cents(editForm.price),
        cost: cents(editForm.cost),
        amountPaid: cents(editForm.amountPaid),
        estimatedTime,
        warrantyDays,
        requestPriceApproval: requestApproval,
        expectedUpdatedAt: editVersion ?? undefined,
      });
      toast.success(requestApproval ? "تم الحفظ وطلب موافقة الزبون" : "تم حفظ تفاصيل الطلب");
      setEditDirty(false);
      setRequestApproval(false);
      await refreshData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التعديلات");
    }
  }

  async function handleArchive(id: number, archived: boolean) {
    try {
      await archiveMutation.mutateAsync({ id, archived });
      toast.success(archived ? "تم نقل الطلب إلى الأرشيف" : "تمت استعادة الطلب");
      if (selectedId === id) setSelectedId(null);
      await refreshData();
    } catch {
      toast.error("تعذر تحديث الأرشيف");
    }
  }

  async function handleBulkArchive() {
    if (!selectedOrderIds.length) return;
    const archived = !showArchived;
    const action = archived ? "أرشفة" : "استعادة";
    if (!window.confirm(`${action} ${selectedOrderIds.length} فاتورة محددة؟ لن يتم حذف أي فاتورة نهائيًا.`)) return;
    try {
      const result = await archiveManyMutation.mutateAsync({ ids: selectedOrderIds, archived });
      toast.success(archived ? `تمت أرشفة ${result.count} فاتورة` : `تمت استعادة ${result.count} فاتورة`);
      setSelectedOrderIds([]);
      await refreshData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `تعذر ${action} الفواتير`);
    }
  }

  async function handleWhatsapp() {
    const order = detailQuery.data?.order;
    if (!order) return;
    const message = `مرحبًا ${order.customerName ?? ""}، تحديث طلبك رقم ${order.barcode}: ${statuses[order.status].label}.`;
    try {
      const result = await whatsappMutation.mutateAsync({ id: order.id, message });
      window.open(result.manualUrl, "_blank", "noopener,noreferrer");
      await utils.orders.getById.invalidate({ id: order.id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فتح واتساب");
    }
  }

  async function handleCopyTracking() {
    const token = detailQuery.data?.order.publicToken;
    if (!token) return;
    await navigator.clipboard.writeText(buildPublicUrl(`/track?t=${token}`));
    toast.success("تم نسخ رابط التتبع الآمن");
  }

  async function handleSaveSettings() {
    try {
      await settingsMutation.mutateAsync({
        ...shopForm,
        phone: shopForm.phone || null,
        whatsappPhone: shopForm.whatsappPhone || null,
        address: shopForm.address || null,
        mapUrl: shopForm.mapUrl || null,
        openingHours: shopForm.openingHours || null,
        warrantyPolicy: shopForm.warrantyPolicy || null,
      });
      toast.success("تم حفظ إعدادات المحل");
      setSettingsOpen(false);
      await utils.owner.me.invalidate();
    } catch {
      toast.error("تعذر حفظ الإعدادات");
    }
  }

  async function handlePasswordChange() {
    if (passwordForm.newPassword.length < 8) return toast.error("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) return toast.error("تأكيد كلمة المرور غير مطابق");
    try {
      await passwordMutation.mutateAsync({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      toast.success("تم تغيير كلمة المرور وتحديث الجلسة");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordOpen(false);
      sessionStorage.removeItem("mustChangeOwnerPassword");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تغيير كلمة المرور");
    }
  }

  async function handleUnlockFinancials() {
    try {
      const result = await financialMutation.mutateAsync({
        password: financialPassword,
        branchId: selectedBranchId,
      });
      setFinancialReport(result);
      setFinancialPassword("");
      setFinancialOpen(false);
      toast.success("تم فتح البيانات المالية لهذه الجلسة");
    } catch {
      toast.error("كلمة المرور غير صحيحة");
    }
  }

  async function handleLogout() {
    await lockBranchMutation.mutateAsync().catch(() => undefined);
    await logoutMutation.mutateAsync();
    navigate(OWNER_LOGIN_PATH);
  }

  if (sessionQuery.isLoading || (authenticated && branchAccessQuery.isLoading)) {
    return (
      <div className="page-background flex min-h-screen items-center justify-center" dir="rtl">
        <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!authenticated || !branchAuthenticated || !selectedBranchId) return null;

  const orders = ordersQuery.data ?? [];
  const followUpOrders = (followUpOrdersQuery.data ?? []).filter(order => order.status !== "delivered" && order.status !== "cancelled");
  const report = reportQuery.data;
  const overview = overviewQuery.data;
  const pendingProposalCounts = new Map((pendingProposalsQuery.data ?? []).map(item => [item.orderId, item.pendingCount]));

  return (
    <div className="page-background min-h-screen" dir="rtl">
      <ServiceBackdrop />
      {selectedId !== null && detailQuery.data?.order && createPortal(
        <Button
          data-testid="owner-invoice-print-button"
          type="button"
          onClick={() => window.open(`/invoice?t=${detailQuery.data.order.publicToken}`, "_blank", "noopener,noreferrer")}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-[100] min-h-14 w-[min(92vw,24rem)] -translate-x-1/2 bg-slate-950 text-base font-black text-white shadow-2xl hover:bg-slate-800"
        >
          <Printer className="h-5 w-5" />طباعة الفاتورة #{detailQuery.data.order.barcode}
        </Button>,
        document.body,
      )}
      <div className="page-content relative z-10">
        <header className="sticky top-0 z-40 border-b border-white/70 bg-white/92 shadow-sm backdrop-blur-xl">
          <div className="container flex min-h-20 flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white p-0.5 shadow-lg shadow-sky-500/20 ring-1 ring-sky-100"><img src={STORE_APP_ICON_URL} alt="الشعار الرسمي لهاتف التميز" className="h-full w-full object-contain" /></span>
              <div><h1 className="text-xl font-black text-slate-950">لوحة {settings?.shopName ?? "هاتف التميز"}</h1><p className="text-xs font-semibold text-slate-500">إدارة الطلبات والعملاء والتقارير</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => navigate("/dashboard/branches")} className="bg-white"><Building2 className="h-4 w-4" /><span>{selectedBranchData?.name ?? branchAccessQuery.data?.branch?.branchName ?? "الفرع المفتوح"}</span></Button>
              <Button variant="outline" onClick={() => setPasswordOpen(true)} className="bg-white"><KeyRound className="h-4 w-4" /><span className="hidden sm:inline">كلمة المرور</span></Button>
              <Button variant="outline" onClick={() => setSettingsOpen(true)} className="bg-white"><Settings className="h-4 w-4" /><span className="hidden sm:inline">الإعدادات</span></Button>
              <Button variant="outline" onClick={() => navigate("/dashboard/control")} className="bg-white"><SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">مركز الإدارة</span></Button>
              <Button variant="outline" onClick={handleLogout} disabled={logoutMutation.isPending} className="border-red-200 bg-white text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">خروج</span></Button>
            </div>
          </div>
        </header>

        <main className="container py-6 sm:py-9">
          <section data-testid="dashboard-primary-create-invoice" className="mb-6 overflow-hidden rounded-[1.75rem] border border-sky-200 bg-gradient-to-l from-sky-500 to-cyan-500 p-4 text-white shadow-xl shadow-sky-500/20 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/35"><Plus className="h-8 w-8" /></span>
                <div><p className="text-xs font-black text-sky-50">أسرع إجراء</p><h2 className="mt-1 text-2xl font-black">إنشاء فاتورة جديدة</h2><p className="mt-1 text-sm font-semibold text-white/85">ابدأ بتسجيل العميل والجهاز والصور وموافقة السعر مباشرة.</p></div>
              </div>
              <Button data-testid="dashboard-create-invoice-button" onClick={() => setCreateOpen(true)} className="min-h-14 w-full touch-manipulation bg-white px-7 text-base font-black text-sky-700 shadow-lg hover:bg-sky-50 sm:w-auto"><Plus className="h-5 w-5" />إنشاء الفاتورة الآن</Button>
            </div>
          </section>
          <section data-testid="dashboard-follow-up-orders" className="mb-6 overflow-hidden rounded-[1.75rem] border border-amber-200 bg-white/95 shadow-xl shadow-amber-900/5 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/80 px-4 py-4 sm:px-6">
              <div><p className="text-xs font-black text-amber-700">بعد إنشاء الفاتورة مباشرة</p><h2 className="mt-1 text-xl font-black text-slate-950">فواتير تحتاج متابعة</h2><p className="mt-1 text-sm text-slate-600">غيّر الحالة أو افتح التعديل والزيادة من هنا. المسلّم والملغي والمؤرشف لا يظهرون.</p></div>
              <Badge className="bg-amber-600 px-3 py-1 text-white">{followUpOrders.length} فاتورة مفتوحة</Badge>
            </div>
            {followUpOrdersQuery.isLoading ? <div className="p-8 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-amber-500" /><p className="mt-2 text-sm text-slate-500">جاري تحميل المتابعة...</p></div> : followUpOrders.length === 0 ? <div className="p-8 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><p className="mt-3 font-black text-slate-900">ما فيه فواتير تحتاج متابعة حاليًا</p></div> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{followUpOrders.map(order => { const config = statuses[order.status]; const pendingIncrease = pendingProposalCounts.get(order.id) ?? 0; return <article key={order.id} className={`rounded-2xl border p-4 shadow-sm ${pendingIncrease > 0 ? "border-red-300 bg-red-50/70" : "border-slate-200 bg-white"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-sky-700">فاتورة #{order.barcode}</p><h3 className="mt-1 font-black text-slate-950">{order.customerName || "بدون اسم"}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-500">{order.deviceInfo}</p></div>{pendingIncrease > 0 && <span className="inline-flex shrink-0 items-center rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white">زيادة معلقة {pendingIncrease}</span>}</div><div className="mt-4"><p className="mb-1 text-xs font-bold text-slate-500">تغيير الحالة</p><Select value={order.status} onValueChange={value => handleStatus(order.id, value as StatusKey)} disabled={statusMutation.isPending}><SelectTrigger className="h-11 w-full bg-white"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statuses).map(([key, item]) => <SelectItem key={key} value={key}>{item.label}</SelectItem>)}</SelectContent></Select></div><div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={() => setSelectedId(order.id)} className="min-h-11 bg-white font-black"><Eye className="h-4 w-4" />عرض وتعديل</Button><Button type="button" variant="outline" onClick={() => setQuickProposalOrderId(order.id)} className="relative min-h-11 border-orange-300 bg-orange-50 font-black text-orange-900"><Plus className="h-4 w-4" />عطل أو زيادة{pendingIncrease > 0 && <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-red-600 ring-2 ring-white" />}</Button></div><div className="mt-3"><Badge className={`ring-1 ${config.className}`}>{config.label}</Badge></div></article>; })}</div>}
          </section>
          <div className="mb-6">
            <OwnerInternalAlertsPanel selectedBranchId={selectedBranchId} branches={branchesQuery.data ?? []} />
          </div>
          <details className="mb-6 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <summary className="cursor-pointer font-black text-slate-800">عرض التنبيهات المؤرشفة واستعادتها</summary>
            <div className="mt-4"><OwnerInternalAlertsPanel selectedBranchId={selectedBranchId} branches={branchesQuery.data ?? []} archived /></div>
          </details>
          <details className="mb-6 rounded-2xl border border-red-200 bg-white/90 p-4 shadow-sm">
            <summary className="cursor-pointer font-black text-red-800">سلة محذوفات التنبيهات والاستعادة الآمنة</summary>
            <div className="mt-4"><OwnerInternalAlertsPanel selectedBranchId={selectedBranchId} branches={branchesQuery.data ?? []} deleted /></div>
          </details>
          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "الطلبات النشطة", value: report?.active ?? 0, icon: ClipboardList, iconClass: "bg-sky-50 text-sky-600" },
              { label: "جاهز للاستلام", value: report?.ready ?? 0, icon: CheckCircle2, iconClass: "bg-emerald-50 text-emerald-600" },
              { label: "بانتظار الموافقة", value: report?.awaitingApproval ?? 0, icon: BellRing, iconClass: "bg-orange-50 text-orange-600" },
              { label: "ربح الشهر", value: financialReport ? formatMoney(financialReport.profit, currency) : "مخفي", icon: TrendingUp, iconClass: "bg-violet-50 text-violet-600" },
            ].map(item => (
              <Card key={item.label} className="border border-white/80 bg-white/92 p-5 shadow-lg shadow-sky-900/5 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-bold text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-black text-slate-950">{item.value}</p></div><span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.iconClass}`}><item.icon className="h-6 w-6" /></span></div>
              </Card>
            ))}
          </section>

          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="إحصاءات الموقع والحسابات">
            {[
              { label: "أجهزة الصيانة المنجزة", value: overview?.completedMaintenanceDevices ?? 0, note: "تم تسليمها منذ أول فاتورة", icon: Wrench, iconClass: "bg-cyan-50 text-cyan-700" },
              { label: "إجمالي زوار الموقع", value: overview?.lifetimeVisitors ?? 0, note: "زيارات مسجلة منذ بدء التتبع", icon: Eye, iconClass: "bg-violet-50 text-violet-700" },
              { label: "داخل الموقع الآن", value: overview?.onlineVisitors ?? 0, note: "آخر نشاط خلال 90 ثانية", icon: Smartphone, iconClass: "bg-emerald-50 text-emerald-700" },
              { label: "الحسابات الموجودة", value: overview?.totalAccounts ?? 0, note: `${overview?.customerAccounts ?? 0} عميل · ${overview?.activeStaffAccounts ?? 0} موظف`, icon: UserRound, iconClass: "bg-amber-50 text-amber-700" },
            ].map(item => (
              <Card key={item.label} className="border border-white/80 bg-white/92 p-5 shadow-lg shadow-sky-900/5 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-slate-500">{item.label}</p><p className="mt-2 text-3xl font-black text-slate-950">{item.value.toLocaleString("ar-SA")}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{item.note}</p></div><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${item.iconClass}`}><item.icon className="h-6 w-6" /></span></div>
              </Card>
            ))}
          </section>

          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "أكثر الأعطال تكرارًا", value: report?.mostCommonFault ? `${report.mostCommonFault.label} (${report.mostCommonFault.count})` : "لا توجد بيانات", icon: Wrench, iconClass: "bg-rose-50 text-rose-600" },
              { label: "سرعة الإنجاز المتوسطة", value: formatDuration(report?.averageCompletionMs ?? 0), note: `${report?.completionSampleSize ?? 0} طلب مكتمل`, icon: CheckCircle2, iconClass: "bg-cyan-50 text-cyan-700" },
              { label: "متوسط قيمة الفاتورة", value: financialReport ? formatMoney(financialReport.averageInvoiceValue, currency) : "مخفي", note: financialReport ? "للطلبات غير الملغاة" : "افتح البيانات المالية", icon: Banknote, iconClass: "bg-emerald-50 text-emerald-700" },
              { label: "متوسط الانتظار قبل الصيانة", value: formatDuration(report?.averageWaitBeforeWorkMs ?? 0), note: `${report?.waitSampleSize ?? 0} طلب بدأ العمل عليه`, icon: PackageCheck, iconClass: "bg-amber-50 text-amber-700" },
            ].map(item => (
              <Card key={item.label} className="border border-white/80 bg-white/92 p-5 shadow-lg shadow-sky-900/5 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-bold text-slate-500">{item.label}</p><p className="mt-2 break-words text-xl font-black text-slate-950">{item.value}</p>{item.note && <p className="mt-1 text-[11px] font-bold text-slate-400">{item.note}</p>}</div><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${item.iconClass}`}><item.icon className="h-6 w-6" /></span></div>
              </Card>
            ))}
          </section>

          <OwnerEngagementPanel selectedBranchId={selectedBranchId} branches={branchesQuery.data ?? []} />

          <CustomerInvoiceLookup />

          <details className="mb-6 rounded-2xl border border-violet-200 bg-white/92 p-5 shadow-lg shadow-violet-900/5">
            <summary className="cursor-pointer font-black text-violet-950">إعدادات أوسمة العملاء</summary>
            <LoyaltyThresholdSettings />
          </details>

          <RatingsAdminPanel branchId={selectedBranchId} />

          <Card className="mb-6 border border-white/80 bg-white/92 p-5 shadow-lg shadow-sky-900/5 backdrop-blur-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-xs font-bold text-sky-600">تقرير اليوم</p><h2 className="mt-1 text-lg font-black text-slate-950">ملخص الحركة اليومية</h2></div>
              <div className="flex items-center gap-2"><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">{report?.today ?? 0} طلب</span><Button size="sm" variant="outline" onClick={() => setFinancialOpen(true)} className="bg-white"><LockKeyhole className="h-4 w-4" />{financialReport ? "تحديث المالية" : "عرض المالية"}</Button></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">مبيعات اليوم</p><p className="mt-2 text-xl font-black text-emerald-950">{financialReport ? formatMoney(financialReport.todayRevenue, currency) : "••••••"}</p></div>
              <div className="rounded-2xl bg-orange-50 p-4"><p className="text-xs font-bold text-orange-700">تكلفة اليوم</p><p className="mt-2 text-xl font-black text-orange-950">{financialReport ? formatMoney(financialReport.todayCost, currency) : "••••••"}</p></div>
              <div className="rounded-2xl bg-violet-50 p-4"><p className="text-xs font-bold text-violet-700">ربح اليوم</p><p className="mt-2 text-xl font-black text-violet-950">{financialReport ? formatMoney(financialReport.todayProfit, currency) : "••••••"}</p></div>
            </div>
          </Card>

          <ExportReportsPanel
            orders={orders}
            financialReport={financialReport}
            branches={branchesQuery.data ?? []}
            selectedBranchId={selectedBranchId}
            shopName={settings?.shopName ?? "هاتف التميز"}
            currency={currency}
            onUnlockFinancials={() => setFinancialOpen(true)}
          />

          <Card data-testid="dashboard-all-invoices-toggle" className="mb-4 overflow-hidden border border-sky-200 bg-white/94 shadow-xl shadow-sky-900/5 backdrop-blur-xl">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><ClipboardList className="h-6 w-6" /></span>
                <div className="min-w-0"><h2 className="text-lg font-black text-slate-950">جميع الفواتير</h2><p className="mt-1 text-sm text-slate-500">افتح القائمة عند الحاجة للبحث أو الفلترة أو الأرشفة.</p></div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Badge variant="outline" className="w-fit bg-sky-50 text-sky-800">{orders.length} فاتورة مطابقة</Badge>
                <Button type="button" data-testid="dashboard-all-invoices-button" aria-expanded={showAllInvoices} aria-controls="dashboard-all-invoices-panel" onClick={() => setShowAllInvoices(value => !value)} className="min-h-12 w-full touch-manipulation bg-sky-600 px-5 font-black text-white hover:bg-sky-700 sm:w-auto">
                  {showAllInvoices ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  {showAllInvoices ? "إخفاء جميع الفواتير" : "عرض جميع الفواتير"}
                </Button>
              </div>
            </div>
          </Card>

          {showAllInvoices && (
            <section id="dashboard-all-invoices-panel" data-testid="dashboard-all-invoices-panel" className="space-y-3">

          <Card className="mb-6 border border-white/80 bg-white/92 p-4 shadow-xl shadow-sky-900/5 backdrop-blur-xl sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <div className="relative flex-1"><Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><Input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="ابحث بالطلب أو العميل أو الجوال أو الجهاز..." className="h-11 bg-white pr-11" /></div>
                <Select value={statusFilter} onValueChange={value => setStatusFilter(value as StatusKey | "all")}><SelectTrigger className="h-11 w-full bg-white sm:w-48"><SelectValue placeholder="كل الحالات" /></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem>{Object.entries(statuses).map(([key, item]) => <SelectItem key={key} value={key}>{item.label}</SelectItem>)}</SelectContent></Select>
                <Select value={serviceFilter} onValueChange={value => setServiceFilter(value as typeof serviceFilter)}><SelectTrigger className="h-11 w-full bg-white sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الخدمات</SelectItem><SelectItem value="maintenance">صيانة</SelectItem><SelectItem value="programming">برمجة</SelectItem></SelectContent></Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => { setSelectedOrderIds([]); setShowArchived(value => !value); }} className={showArchived ? "border-slate-800 bg-slate-900 text-white hover:bg-slate-800" : "bg-white"}>{showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{showArchived ? "الطلبات الحالية" : "الأرشيف"}</Button>
                <Button variant="outline" onClick={refreshData} className="bg-white"><RefreshCw className={`h-4 w-4 ${ordersQuery.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
              </div>
            </div>
          </Card>

          {orders.length > 0 && <Card className="mb-3 flex flex-col gap-3 border-sky-200 bg-sky-50/90 p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-center gap-3 font-black text-slate-800"><input type="checkbox" className="h-5 w-5 accent-sky-600" checked={orders.every(order => selectedOrderIds.includes(order.id))} onChange={event => setSelectedOrderIds(event.target.checked ? orders.map(order => order.id) : [])} />تحديد كل النتائج الحالية</label>
            <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-bold text-slate-600">تم تحديد {selectedOrderIds.length} فاتورة</span><Button type="button" disabled={!selectedOrderIds.length || archiveManyMutation.isPending} onClick={handleBulkArchive} className={showArchived ? "bg-emerald-600 font-black text-white hover:bg-emerald-700" : "bg-slate-900 font-black text-white hover:bg-slate-800"}>{showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{showArchived ? "استعادة المحدد" : "أرشفة المحدد"}</Button></div>
          </Card>}

          <Card className="overflow-hidden border border-white/80 bg-white/94 shadow-xl shadow-sky-900/5 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-black text-slate-950">{showArchived ? "الطلبات المؤرشفة" : "قائمة الطلبات"}</h2><p className="mt-1 text-xs text-slate-500">{orders.length} طلب مطابق</p></div>{financialReport && <div className="hidden items-center gap-5 text-xs text-slate-500 md:flex"><span>مبيعات الشهر: <strong className="text-slate-900">{formatMoney(financialReport.revenue, currency)}</strong></span><span>المتبقي: <strong className="text-amber-700">{formatMoney(financialReport.unpaid, currency)}</strong></span></div>}</div>
            {ordersQuery.isLoading ? <div className="p-14 text-center"><Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-sky-500" /><p className="text-slate-500">جاري تحميل الطلبات...</p></div> : orders.length === 0 ? <div className="p-14 text-center"><ClipboardList className="mx-auto mb-4 h-12 w-12 text-sky-200" /><h3 className="font-black text-slate-900">لا توجد طلبات مطابقة</h3><p className="mt-2 text-sm text-slate-500">غيّر الفلاتر أو أنشئ طلبًا جديدًا.</p></div> : <>
              <div className="hidden overflow-x-auto lg:block"><table className="w-full text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-3">تحديد</th><th className="px-5 py-3">الطلب</th><th className="px-5 py-3">العميل والجهاز</th><th className="px-5 py-3">الحالة</th><th className="px-5 py-3">الحساب</th><th className="px-5 py-3">التاريخ</th><th className="px-5 py-3">الإجراءات</th></tr></thead><tbody className="divide-y divide-slate-100">{orders.map(order => { const config = statuses[order.status]; const pendingIncrease = pendingProposalCounts.get(order.id) ?? 0; const checked = selectedOrderIds.includes(order.id); return <tr key={order.id} className={`transition-colors hover:bg-sky-50/50 ${checked ? "bg-sky-50" : pendingIncrease ? "bg-red-50/50" : ""}`}><td className="px-3 py-4"><input aria-label={`تحديد فاتورة ${order.barcode}`} type="checkbox" className="h-5 w-5 accent-sky-600" checked={checked} onChange={event => setSelectedOrderIds(current => event.target.checked ? [...current, order.id] : current.filter(id => id !== order.id))} /></td><td className="px-5 py-4"><strong className="text-lg text-slate-950">#{order.barcode}</strong><p className="text-xs text-slate-500">{order.serviceType === "maintenance" ? "صيانة" : "برمجة"}</p>{pendingIncrease > 0 && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">زيادة تنتظر الموافقة ({pendingIncrease})</span>}</td><td className="px-5 py-4"><p className="font-bold text-slate-900">{order.customerName || "بدون اسم"}</p><p className="max-w-xs truncate text-xs text-slate-500">{order.deviceInfo} · {order.customerPhone || "لا يوجد جوال"}</p></td><td className="px-5 py-4"><Select value={order.status} onValueChange={value => handleStatus(order.id, value as StatusKey)} disabled={showArchived || statusMutation.isPending}><SelectTrigger className="h-9 w-44 border-0 bg-transparent p-0 shadow-none"><Badge className={`ring-1 ${config.className}`}>{config.label}</Badge></SelectTrigger><SelectContent>{Object.entries(statuses).map(([key, item]) => <SelectItem key={key} value={key}>{item.label}</SelectItem>)}</SelectContent></Select></td><td className="px-5 py-4"><p className="font-bold text-slate-900">{formatMoney(order.price, currency)}</p><p className="text-xs text-emerald-700">مدفوع {formatMoney(order.amountPaid, currency)}</p></td><td className="px-5 py-4 text-xs text-slate-500">{formatDate(order.createdAt)}</td><td className="px-5 py-4"><div className="flex gap-2"><Button size="icon" variant="outline" onClick={() => setQuickProposalOrderId(order.id)} className="relative h-9 w-9 border-orange-300 bg-orange-50 text-orange-800" title="إضافة عطل أو زيادة"><Plus className="h-4 w-4" />{pendingIncrease > 0 && <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-red-600 ring-2 ring-white" />}</Button><Button size="icon" variant="outline" onClick={() => setSelectedId(order.id)} className="h-9 w-9 bg-white" title="عرض وتعديل"><Eye className="h-4 w-4" /></Button><Button size="icon" variant="outline" onClick={() => handleArchive(order.id, !showArchived)} className="h-9 w-9 bg-white" title={showArchived ? "استعادة" : "أرشفة"}>{showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button></div></td></tr>; })}</tbody></table></div>
              <div className="grid gap-3 p-3 lg:hidden">{orders.map(order => { const config = statuses[order.status]; const pendingIncrease = pendingProposalCounts.get(order.id) ?? 0; const checked = selectedOrderIds.includes(order.id); return <article key={order.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${checked ? "border-sky-400 ring-2 ring-sky-100" : pendingIncrease ? "border-red-300 ring-1 ring-red-100" : "border-slate-100"}`}><label className="mb-3 flex cursor-pointer items-center gap-2 text-sm font-black text-sky-800"><input aria-label={`تحديد فاتورة ${order.barcode}`} type="checkbox" className="h-5 w-5 accent-sky-600" checked={checked} onChange={event => setSelectedOrderIds(current => event.target.checked ? [...current, order.id] : current.filter(id => id !== order.id))} />تحديد هذه الفاتورة</label><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-sky-600">طلب #{order.barcode}</p><h3 className="mt-1 font-black text-slate-950">{order.customerName || "بدون اسم"}</h3><p className="mt-1 text-sm text-slate-500">{order.deviceInfo}</p>{pendingIncrease > 0 && <span className="mt-2 inline-flex rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white">زيادة تنتظر الموافقة ({pendingIncrease})</span>}</div><Badge className={`ring-1 ${config.className}`}>{config.label}</Badge></div><div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm"><div><p className="text-xs text-slate-500">الإجمالي</p><strong>{formatMoney(order.price, currency)}</strong></div><div><p className="text-xs text-slate-500">المدفوع</p><strong>{formatMoney(order.amountPaid, currency)}</strong></div></div><label className="mt-4 block"><span className="mb-2 block text-sm font-black text-slate-700">تغيير حالة الجهاز</span><select aria-label={`تغيير حالة الطلب ${order.barcode}`} value={order.status} onChange={event => void handleStatus(order.id, event.target.value as StatusKey)} disabled={showArchived || statusMutation.isPending} className="min-h-12 w-full touch-manipulation appearance-auto rounded-xl border border-sky-200 bg-white px-4 text-base font-bold text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:opacity-60">{Object.entries(statuses).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setQuickProposalOrderId(order.id)} className="relative min-h-11 touch-manipulation border-orange-300 bg-orange-50 text-orange-800"><Plus className="h-4 w-4" />زيادة{pendingIncrease > 0 && <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-red-600 ring-2 ring-white" />}</Button><Button onClick={() => setSelectedId(order.id)} className="min-h-11 flex-1 touch-manipulation bg-sky-500 text-white"><Eye className="h-4 w-4" />التفاصيل</Button><Button variant="outline" onClick={() => handleArchive(order.id, !showArchived)} className="min-h-11 touch-manipulation bg-white">{showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button></div></article>; })}</div>
            </>}
          </Card>
            </section>
          )}

          <Card className="mt-6 border border-white/80 bg-white/94 p-5 shadow-xl shadow-sky-900/5 backdrop-blur-xl sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sky-600"><ImagePlus className="h-5 w-5" /><span className="text-xs font-bold">توثيق الاستلام</span></div>
                <h2 className="mt-1 text-xl font-black text-slate-950">صور الجهاز وحالته</h2>
                <p className="mt-1 text-sm text-slate-500">ارفع صور الجهاز وحدد ما إذا كانت الصورة تظهر للزبون في صفحة التتبع.</p>
              </div>
              <Select value={photoOrderId ? String(photoOrderId) : undefined} onValueChange={value => setPhotoOrderId(Number(value))}>
                <SelectTrigger className="h-11 w-full bg-white sm:w-72"><SelectValue placeholder="اختر طلبًا لإدارة صوره" /></SelectTrigger>
                <SelectContent>{orders.map(order => <SelectItem key={order.id} value={String(order.id)}>طلب #{order.barcode} · {order.customerName || order.deviceInfo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {photoOrderId ? (
              <PhotoManager orderId={photoOrderId} />
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 p-8 text-center text-sm text-slate-500">اختر طلبًا من القائمة لرفع صور الجهاز.</div>
            )}
          </Card>
        </main>
      </div>

      <Dialog open={createOpen} onOpenChange={open => { if (createProgress) return; setCreateOpen(open); if (!open) { setIntakePhotos([]); setRequestApprovalOnCreate(false); } }}><DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto bg-white" dir="rtl"><DialogHeader><DialogTitle className="text-2xl font-black">إنشاء طلب جديد</DialogTitle><DialogDescription>وثّق العميل والجهاز والحساب والمتابعة الداخلية في نموذج واسع وواضح.</DialogDescription></DialogHeader><Field label="الفرع"><Select value={newOrderBranchId} onValueChange={setNewOrderBranchId}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent>{branchesQuery.data?.filter(branch => branch.isActive).map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select></Field><OrderFormFields value={orderForm} onChange={setOrderForm} /><CustomerInvoiceLookup phone={orderForm.customerPhone} compact /><IntakePhotoPicker files={intakePhotos} onChange={setIntakePhotos} disabled={Boolean(createProgress)} /><CreatePriceApprovalOption checked={requestApprovalOnCreate} onChange={setRequestApprovalOnCreate} price={orderForm.price} customerPhone={orderForm.customerPhone} disabled={Boolean(createProgress)} /><div className="flex justify-end gap-3 border-t pt-4"><Button variant="outline" onClick={() => { setCreateOpen(false); setIntakePhotos([]); setRequestApprovalOnCreate(false); }} disabled={Boolean(createProgress)}>إلغاء</Button><Button onClick={handleCreate} disabled={Boolean(createProgress)} className="bg-sky-500 font-bold text-white hover:bg-sky-600">{createProgress && <Loader2 className="h-4 w-4 animate-spin" />}{createProgress ?? (requestApprovalOnCreate ? "إنشاء وإرسال الموافقة" : "إنشاء الطلب")}</Button></div></DialogContent></Dialog>

      <Dialog open={quickProposalOrderId !== null} onOpenChange={open => !open && setQuickProposalOrderId(null)}><DialogContent className="max-w-2xl bg-white" dir="rtl"><DialogHeader><DialogTitle className="text-2xl font-black">إضافة عطل أو زيادة سريعة</DialogTitle><DialogDescription>سيظهر العرض للعميل للموافقة، ولن يتغير سعر الفاتورة قبل موافقته.</DialogDescription></DialogHeader>{quickProposalOrderId && <AdditionalRepairOwnerPanel orderId={quickProposalOrderId} defaultOpen />}</DialogContent></Dialog>

      <Dialog open={financialOpen} onOpenChange={setFinancialOpen}><DialogContent className="max-w-md bg-white" dir="rtl"><DialogHeader><DialogTitle className="text-2xl font-black">فتح الأرباح والتكاليف</DialogTitle><DialogDescription>أدخل كلمة مرور المالك لعرض البيانات المالية للفرع المحدد.</DialogDescription></DialogHeader><Field label="كلمة مرور المالك"><Input type="password" value={financialPassword} onChange={event => setFinancialPassword(event.target.value)} onKeyDown={event => event.key === "Enter" && handleUnlockFinancials()} /></Field><Button onClick={handleUnlockFinancials} disabled={financialMutation.isPending} className="w-full bg-violet-600 font-bold text-white hover:bg-violet-700">{financialMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}عرض البيانات المالية</Button></DialogContent></Dialog>

      {selectedId !== null && detailQuery.data && (
        <>
          {typeof document !== "undefined" && document.querySelector('[role="dialog"]') && createPortal(
            <AdditionalRepairOwnerPanel orderId={selectedId} />,
            document.querySelector('[role="dialog"]')!,
          )}
          {typeof document !== "undefined" && document.querySelector('[role="dialog"]') && createPortal(
            <OrderDirectMessageComposer orderId={detailQuery.data.order.id} barcode={detailQuery.data.order.barcode} customerName={detailQuery.data.order.customerName} customerPhone={detailQuery.data.order.customerPhone} customerId={detailQuery.data.order.customerId} />,
            document.querySelector('[role="dialog"]')!,
          )}
          {typeof document !== "undefined" && document.querySelector('[role="dialog"]') && createPortal(
            <OwnerCustomerLoyaltyBadge orderId={detailQuery.data.order.id} />,
            document.querySelector('[role="dialog"]')!,
          )}
          {detailQuery.data.order.priceApprovalStatus !== "not_required" && typeof document !== "undefined" && document.querySelector('[role="dialog"]') && createPortal(
            <section className="mt-5" aria-label="حالة موافقة السعر">
              <PriceApprovalStatusCard status={detailQuery.data.order.priceApprovalStatus} price={detailQuery.data.order.price} requestedAt={detailQuery.data.order.approvalRequestedAt} respondedAt={detailQuery.data.order.approvalRespondedAt} currency={currency} />
            </section>,
            document.querySelector('[role="dialog"]')!,
          )}
          {detailQuery.data.photos.length > 0 && typeof document !== "undefined" && document.querySelector('[role="dialog"]') && createPortal(
            <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="صور الطلب والمصورون">
              <p className="mb-2 text-xs font-black text-slate-700">صور الجهاز والمصور</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {detailQuery.data.photos.slice(0, 6).map(photo => (
                  <figure key={photo.id} className="overflow-hidden rounded-lg border bg-slate-50">
                    <img src={photo.url} alt={photo.caption || "صورة الجهاز"} className="aspect-square w-full object-cover" />
                    <figcaption className="p-2"><p className="truncate text-xs font-bold">{photo.caption || "صورة الجهاز"}</p><p className="mt-1 text-[11px] text-slate-600">رفعها: {photo.uploadedBy?.name || "المالك"}</p></figcaption>
                  </figure>
                ))}
              </div>
            </section>,
            document.querySelector('[role="dialog"]')!,
          )}
        </>
      )}

      <Dialog open={selectedId !== null} onOpenChange={open => { if (!open && editDirty && !window.confirm("لديك تعديلات غير محفوظة. هل تريد إغلاق الفاتورة دون حفظها؟")) return; if (!open) { setSelectedId(null); setEditDirty(false); } }}><DialogContent className="max-h-[96vh] max-w-6xl overflow-y-auto bg-white" dir="rtl">{detailQuery.isLoading || !detailQuery.data ? <><DialogHeader className="sr-only"><DialogTitle>تحميل تفاصيل الطلب</DialogTitle><DialogDescription>يرجى الانتظار حتى تكتمل بيانات الطلب.</DialogDescription></DialogHeader><div className="p-12 text-center"><Loader2 className="mx-auto h-9 w-9 animate-spin text-sky-500" /></div></> : <><DialogHeader><DialogTitle className="flex flex-wrap items-center gap-3 text-2xl font-black">طلب #{detailQuery.data.order.barcode}<Badge className={`ring-1 ${statuses[detailQuery.data.order.status].className}`}>{statuses[detailQuery.data.order.status].label}</Badge>{editDirty && <Badge className="bg-amber-100 text-amber-900">تعديلات غير محفوظة</Badge>}</DialogTitle><DialogDescription>{detailQuery.data.order.customerName || "بدون اسم"} · {detailQuery.data.order.deviceInfo}</DialogDescription></DialogHeader><div className="grid gap-5 xl:grid-cols-[1.45fr_0.55fr]"><div><OrderFormFields value={editForm} onChange={value => { setEditForm(value); setEditDirty(true); }} /><button type="button" onClick={() => { setRequestApproval(value => !value); setEditDirty(true); }} className={`mt-4 flex w-full items-center gap-3 rounded-xl border p-4 text-right transition ${requestApproval ? "border-orange-300 bg-orange-50 text-orange-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}><span className={`flex h-6 w-6 items-center justify-center rounded-md border ${requestApproval ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 bg-white"}`}>{requestApproval && <CheckCircle2 className="h-4 w-4" />}</span><span><strong className="block">طلب موافقة الزبون على السعر</strong><small>ينقل الطلب إلى حالة انتظار الموافقة ويظهر زري القبول والرفض للزبون.</small></span></button><div className="mt-5 flex flex-wrap gap-3"><Button onClick={handleSaveDetails} disabled={updateMutation.isPending || !editDirty} className="bg-sky-500 font-bold text-white hover:bg-sky-600"><Edit3 className="h-4 w-4" />{editDirty ? "حفظ التعديلات" : "محفوظ"}</Button><Button variant="outline" onClick={() => window.open(`/invoice?t=${detailQuery.data.order.publicToken}`, "_blank", "noopener,noreferrer")} className="border-slate-300 bg-slate-950 text-white hover:bg-slate-800"><Printer className="h-4 w-4" />طباعة الفاتورة #{detailQuery.data.order.barcode} مع QR والباركود</Button><Button variant="outline" onClick={handleCopyTracking} className="bg-white"><Copy className="h-4 w-4" />نسخ رابط التتبع</Button><Button variant="outline" onClick={handleWhatsapp} disabled={whatsappMutation.isPending || !detailQuery.data.order.customerPhone} className="border-emerald-200 bg-emerald-50 text-emerald-800"><MessageCircle className="h-4 w-4" />إرسال واتساب</Button></div></div><aside className="space-y-4"><Card className="border-2 border-amber-300 bg-amber-50 p-4 shadow-sm"><p className="text-xs font-black text-amber-700">مكان الجهاز — داخلي فقط</p><p className="mt-2 whitespace-pre-wrap break-words text-base font-black leading-7 text-amber-950">{editForm.deviceLocation || "غير محدد"}</p><div className="mt-3 border-t border-amber-200 pt-3 text-xs leading-6 text-slate-600"><p>أنشأ الطلب: {detailQuery.data.staffActors.createdBy?.name || "المالك"}</p><p>استلم الجهاز: {detailQuery.data.staffActors.receivedBy?.name || "المالك"}</p><p>آخر تحديث: {detailQuery.data.staffActors.lastUpdatedBy?.name || "المالك"}</p><p>آخر تحديث للمكان: {detailQuery.data.staffActors.locationUpdatedBy?.name || "المالك"}</p></div></Card><Card className="border-slate-200 bg-slate-50 p-4"><h3 className="mb-4 font-black text-slate-900">خط الحالة</h3><div className="space-y-4">{detailQuery.data.history.map(event => <div key={event.id} className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" /><div><p className="text-sm font-bold text-slate-900">{statuses[event.toStatus as StatusKey]?.label ?? event.toStatus}</p><p className="mt-1 text-xs leading-5 text-slate-500">{event.note || "تم تحديث الطلب"}</p><p className="mt-1 text-[11px] font-bold text-slate-500">بواسطة: {event.changedBy}</p><time className="mt-1 block text-[11px] text-slate-400">{formatDate(event.createdAt)}</time></div></div>)}</div></Card><Card className="border-slate-200 bg-white p-4"><h3 className="mb-3 font-black text-slate-900">الإشعارات</h3>{detailQuery.data.notifications.length ? <div className="space-y-3">{detailQuery.data.notifications.slice(0, 5).map(message => <div key={message.id} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between gap-2 text-xs"><strong>{message.eventType}</strong><span className={message.status === "sent" ? "text-emerald-700" : "text-amber-700"}>{message.status === "requires_setup" ? "إرسال يدوي" : message.status}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{message.message}</p></div>)}</div> : <p className="text-sm text-slate-500">لا توجد إشعارات مسجلة.</p>}</Card>{detailQuery.data.order.archived ? <Button onClick={() => handleArchive(detailQuery.data.order.id, false)} variant="outline" className="w-full bg-white"><ArchiveRestore className="h-4 w-4" />استعادة من الأرشيف</Button> : <Button onClick={() => handleArchive(detailQuery.data.order.id, true)} variant="outline" className="w-full border-red-200 bg-red-50 text-red-700"><Archive className="h-4 w-4" />نقل إلى الأرشيف</Button>}</aside></div></>}</DialogContent></Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto bg-white" dir="rtl"><DialogHeader><DialogTitle className="text-2xl font-black">إعدادات المحل</DialogTitle><DialogDescription>تظهر هذه البيانات للزبائن وفي الفاتورة.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="اسم المحل"><Input value={shopForm.shopName} onChange={e => setShopForm({ ...shopForm, shopName: e.target.value })} /></Field><Field label="الوصف"><Input value={shopForm.subtitle} onChange={e => setShopForm({ ...shopForm, subtitle: e.target.value })} /></Field><Field label="رقم الاتصال"><Input value={shopForm.phone} onChange={e => setShopForm({ ...shopForm, phone: e.target.value })} dir="ltr" /></Field><Field label="رقم واتساب"><Input value={shopForm.whatsappPhone} onChange={e => setShopForm({ ...shopForm, whatsappPhone: e.target.value })} dir="ltr" /></Field><Field label="العملة"><Input value={shopForm.currency} onChange={e => setShopForm({ ...shopForm, currency: e.target.value })} /></Field><Field label="رابط الموقع"><Input value={shopForm.mapUrl} onChange={e => setShopForm({ ...shopForm, mapUrl: e.target.value })} dir="ltr" /></Field><div className="sm:col-span-2"><Field label="العنوان"><Textarea value={shopForm.address} onChange={e => setShopForm({ ...shopForm, address: e.target.value })} /></Field></div><div className="sm:col-span-2"><Field label="أوقات العمل"><Textarea value={shopForm.openingHours} onChange={e => setShopForm({ ...shopForm, openingHours: e.target.value })} /></Field></div><div className="sm:col-span-2"><Field label="سياسة الضمان"><Textarea value={shopForm.warrantyPolicy} onChange={e => setShopForm({ ...shopForm, warrantyPolicy: e.target.value })} rows={4} /></Field></div></div><Button onClick={handleSaveSettings} disabled={settingsMutation.isPending} className="w-full bg-sky-500 font-bold text-white hover:bg-sky-600">حفظ إعدادات المحل</Button></DialogContent></Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}><DialogContent className="max-w-md bg-white" dir="rtl"><DialogHeader><DialogTitle className="text-2xl font-black">تغيير كلمة المرور</DialogTitle><DialogDescription>استخدم 8 أحرف على الأقل واحفظها في مكان آمن.</DialogDescription></DialogHeader><div className="space-y-4"><Field label="كلمة المرور الحالية"><Input type="password" value={passwordForm.currentPassword} onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} /></Field><Field label="كلمة المرور الجديدة"><Input type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} /></Field><Field label="تأكيد كلمة المرور"><Input type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} /></Field><Button onClick={handlePasswordChange} disabled={passwordMutation.isPending} className="w-full bg-slate-950 font-bold text-white hover:bg-slate-800"><KeyRound className="h-4 w-4" />تحديث كلمة المرور</Button></div></DialogContent></Dialog>
    </div>
  );
}

function OrderFormFields({ value, onChange }: { value: OrderForm; onChange: (value: OrderForm) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="sm:col-span-2 xl:col-span-4 rounded-xl bg-sky-50 px-4 py-2 text-sm font-black text-sky-900">بيانات العميل والخدمة</div>
      <Field label="اسم العميل"><Input value={value.customerName} onChange={e => onChange({ ...value, customerName: e.target.value })} /></Field>
      <Field label="رقم الجوال"><Input value={value.customerPhone} onChange={e => onChange({ ...value, customerPhone: e.target.value })} dir="ltr" /></Field>
      <Field label="نوع الخدمة"><Select value={value.serviceType} onValueChange={serviceType => onChange({ ...value, serviceType: serviceType as OrderForm["serviceType"] })}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maintenance">صيانة</SelectItem><SelectItem value="programming">برمجة</SelectItem></SelectContent></Select></Field>
      <div className="hidden xl:block" />

      <div className="sm:col-span-2 xl:col-span-4 rounded-xl bg-violet-50 px-4 py-2 text-sm font-black text-violet-900">بيانات الجهاز والعطل</div>
      <div className="sm:col-span-2"><Field label="معلومات الجهاز *"><Input value={value.deviceInfo} onChange={e => onChange({ ...value, deviceInfo: e.target.value })} placeholder="مثال: iPhone 13 Pro" /></Field></div>
      <Field label="الشركة"><Input value={value.deviceBrand} onChange={e => onChange({ ...value, deviceBrand: e.target.value })} placeholder="Apple / Samsung" /></Field>
      <Field label="الموديل"><Input value={value.deviceModel} onChange={e => onChange({ ...value, deviceModel: e.target.value })} /></Field>
      <Field label="الرقم التسلسلي / IMEI"><Input value={value.serialNumber} onChange={e => onChange({ ...value, serialNumber: e.target.value })} dir="ltr" /></Field>
      <Field label="الملحقات المستلمة"><Input value={value.receivedAccessories} onChange={e => onChange({ ...value, receivedAccessories: e.target.value })} placeholder="شاحن، غطاء، شريحة..." /></Field>
      <div className="sm:col-span-2 xl:col-span-4"><Field label="العطل المبلّغ عنه"><Textarea className="min-h-20" value={value.reportedIssue} onChange={e => onChange({ ...value, reportedIssue: e.target.value })} placeholder="مثال: الشاشة لا تعمل / مدخل الشاحن / البطارية" /></Field></div>
      <div className="sm:col-span-2 xl:col-span-4"><Field label="حالة الجهاز عند الاستلام"><Textarea className="min-h-20" value={value.intakeCondition} onChange={e => onChange({ ...value, intakeCondition: e.target.value })} placeholder="الخدوش، الكسر، آثار السوائل أو أي ملاحظة ظاهرة" /></Field></div>

      <div className="sm:col-span-2 xl:col-span-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><Field label="مكان الجهاز داخليًا — لا يظهر للعميل"><Textarea className="min-h-24 border-amber-300 bg-white text-base font-bold leading-7" value={value.deviceLocation} onChange={e => onChange({ ...value, deviceLocation: e.target.value })} placeholder="مثال: عند ياسر، الرف الثاني، ناقص قطعة الشحن، متوقع يخلص بعد ساعة" /></Field></div>

      <div className="sm:col-span-2 xl:col-span-4 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-900">السعر والضمان والمدة</div>
      <Field label="السعر (ريال)"><Input type="number" min="0" step="0.01" value={value.price} onChange={e => onChange({ ...value, price: e.target.value })} /></Field>
      <Field label="التكلفة (ريال)"><Input type="number" min="0" step="0.01" value={value.cost} onChange={e => onChange({ ...value, cost: e.target.value })} /></Field>
      <Field label="المدفوع (ريال)"><Input type="number" min="0" step="0.01" value={value.amountPaid} onChange={e => onChange({ ...value, amountPaid: e.target.value })} /></Field>
      <Field label="مدة الإنجاز المتوقعة"><Input value={value.estimatedHours} onChange={e => onChange({ ...value, estimatedHours: e.target.value })} placeholder="مثال: ساعتين، يوم ونص أو أسبوعين" /></Field>
      <Field label="مدة الضمان"><Input value={value.warrantyYears} onChange={e => onChange({ ...value, warrantyYears: e.target.value })} placeholder="مثال: 6 شهور، سنة ونص أو سنتين" /></Field>

      <div className="sm:col-span-2 xl:col-span-4 rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-800">الملاحظات — آخر خطوة</div>
      <div className="sm:col-span-2 xl:col-span-4"><Field label="ملاحظات تظهر للزبون"><Textarea className="min-h-24" value={value.customerVisibleNotes} onChange={e => onChange({ ...value, customerVisibleNotes: e.target.value })} /></Field></div>
      <div className="sm:col-span-2 xl:col-span-4"><Field label="ملاحظات داخلية للمالك فقط"><Textarea className="min-h-28 border-slate-300 bg-slate-50" value={value.internalNotes} onChange={e => onChange({ ...value, internalNotes: e.target.value })} /></Field></div>
    </div>
  );
}

function PhotoManager({ orderId }: { orderId: number }) {
  const utils = trpc.useUtils();
  const detailQuery = trpc.orders.getById.useQuery({ id: orderId }, { retry: false });
  const uploadMutation = trpc.orders.uploadPhoto.useMutation();
  const visibilityMutation = trpc.orders.setPhotoVisibility.useMutation();
  const deleteMutation = trpc.orders.deletePhoto.useMutation();
  const [caption, setCaption] = useState("");
  const [visibleToCustomer, setVisibleToCustomer] = useState(false);

  const refresh = () => utils.orders.getById.invalidate({ id: orderId });

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files).slice(0, 6);
    const unsupported = selected.find(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type));
    if (unsupported) return toast.error("الأنواع المسموحة: JPG وPNG وWEBP");
    const oversized = selected.find(file => file.size > 6 * 1024 * 1024);
    if (oversized) return toast.error("حجم كل صورة يجب ألا يتجاوز 6 ميجابايت");

    try {
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        await uploadMutation.mutateAsync({
          orderId,
          dataUrl: await readAsDataUrl(file),
          caption: caption.trim() ? (selected.length > 1 ? `${caption.trim()} ${index + 1}` : caption.trim()) : undefined,
          visibleToCustomer,
        });
      }
      toast.success(`تم رفع ${selected.length} ${selected.length === 1 ? "صورة" : "صور"}`);
      setCaption("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الصورة");
    }
  }

  async function toggleVisibility(photoId: number, visible: boolean) {
    try {
      await visibilityMutation.mutateAsync({ orderId, photoId, visibleToCustomer: visible });
      toast.success(visible ? "ستظهر الصورة للزبون" : "أصبحت الصورة داخلية فقط");
      await refresh();
    } catch {
      toast.error("تعذر تحديث ظهور الصورة");
    }
  }

  async function removePhoto(photoId: number) {
    if (!window.confirm("هل تريد حذف هذه الصورة من الطلب؟")) return;
    try {
      await deleteMutation.mutateAsync({ orderId, photoId });
      toast.success("تم حذف الصورة من الطلب");
      await refresh();
    } catch {
      toast.error("تعذر حذف الصورة");
    }
  }

  const photos = detailQuery.data?.photos ?? [];

  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-3 rounded-2xl border border-sky-100 bg-sky-50/50 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label="وصف الصورة (اختياري)">
          <Input value={caption} onChange={event => setCaption(event.target.value)} placeholder="مثال: حالة الشاشة عند الاستلام" className="bg-white" />
        </Field>
        <button type="button" onClick={() => setVisibleToCustomer(value => !value)} className={`flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition ${visibleToCustomer ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
          <span className={`h-3 w-3 rounded-full ${visibleToCustomer ? "bg-emerald-500" : "bg-slate-300"}`} />
          {visibleToCustomer ? "تظهر للزبون" : "داخلية فقط"}
        </button>
        <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 text-sm font-bold text-white shadow-md shadow-sky-500/20 hover:bg-sky-600 ${uploadMutation.isPending ? "pointer-events-none opacity-60" : ""}`}>
          {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          رفع صور
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={event => { void handleFiles(event.target.files); event.target.value = ""; }} />
        </label>
      </div>

      {detailQuery.isLoading ? (
        <div className="p-8 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-sky-500" /></div>
      ) : photos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center"><ImagePlus className="mx-auto mb-3 h-10 w-10 text-slate-300" /><p className="text-sm text-slate-500">لا توجد صور موثقة لهذا الطلب بعد.</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {photos.map(photo => (
            <figure key={photo.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <img src={photo.url} alt={photo.caption ?? "صورة الجهاز"} className="aspect-square w-full bg-slate-100 object-cover" />
              <figcaption className="space-y-3 p-3">
                <p className="min-h-5 truncate text-sm font-bold text-slate-800">{photo.caption || "صورة الجهاز"}</p>
                <p className="text-xs text-slate-500">رفعها: {photo.uploadedBy?.name || "المالك"}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggleVisibility(photo.id, !photo.visibleToCustomer)} disabled={visibilityMutation.isPending} className={`flex-1 ${photo.visibleToCustomer ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-white"}`}>
                    <Eye className="h-3.5 w-3.5" />{photo.visibleToCustomer ? "مرئية" : "داخلية"}
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => removePhoto(photo.id)} disabled={deleteMutation.isPending} className="h-9 w-9 border-red-200 bg-red-50 text-red-700"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
