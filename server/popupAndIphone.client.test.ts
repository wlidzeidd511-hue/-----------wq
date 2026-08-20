import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("one-time popups and iPhone order status", () => {
  it("persists direct-message acknowledgement, polls visibly, and blocks immediate queue re-entry", () => {
    const inbox = source("client/src/components/DirectMessageInbox.tsx");
    expect(inbox).toContain("trpc.engagement.acknowledgeMessage.useMutation");
    expect(inbox).toContain("dismissedIds.current.has(message.id)");
    expect(inbox).toContain("acknowledgedIds.current.add(activeMessageId)");
    expect(inbox).toContain("window.localStorage.setItem(LAST_MESSAGE_KEY");
    expect(inbox).toContain("refetchInterval: 2_500");
    expect(inbox).toContain("refetchIntervalInBackground: false");
  });

  it("shows welcome and every exact order status once instead of rotating another message", () => {
    const welcome = source("client/src/components/WelcomePopup.tsx");
    const statusPopup = source("client/src/components/OrderStatusPopup.tsx");
    expect(welcome).toContain("window.localStorage.getItem(WELCOME_SEEN_KEY)");
    expect(welcome).not.toContain("window.sessionStorage");
    expect(statusPopup).toContain("hattef-order-popup-seen-${orderToken}-${status}");
    expect(statusPopup).toContain("trpc.engagement.claimStatusPopup.useMutation");
    expect(statusPopup).toContain("statusKey: status");
    expect(statusPopup).toContain("enabled: Boolean(category) && !hasSeen");
    expect(statusPopup).not.toContain("excludeId");
  });

  it("places the primary create-invoice action before alerts and removes the duplicate filter-bar button", () => {
    const dashboard = source("client/src/pages/Dashboard.tsx");
    const primaryAction = dashboard.indexOf('data-testid="dashboard-primary-create-invoice"');
    const alerts = dashboard.indexOf("<OwnerInternalAlertsPanel");
    expect(primaryAction).toBeGreaterThan(-1);
    expect(primaryAction).toBeLessThan(alerts);
    expect(dashboard).toContain('data-testid="dashboard-create-invoice-button"');
    expect(dashboard).not.toContain(">طلب جديد</Button>");
  });

  it("renders a native touch-friendly status selector in the iPhone card layout", () => {
    const dashboard = source("client/src/pages/Dashboard.tsx");
    expect(dashboard).toContain("تغيير حالة الجهاز");
    expect(dashboard).toContain("<select aria-label={`تغيير حالة الطلب ${order.barcode}`}");
    expect(dashboard).toContain("event.target.value as StatusKey");
    expect(dashboard).toContain("min-h-12 w-full touch-manipulation appearance-auto");
    expect(dashboard).toContain("lg:hidden");
  });

  it("keeps tracking and account sign-in cards within the iPhone viewport", () => {
    const css = source("client/src/index.css");
    const tracking = source("client/src/pages/TrackOrder.tsx");
    const staff = source("client/src/pages/StaffPortal.tsx");
    const customer = source("client/src/pages/CustomerPortal.tsx");

    expect(css).toContain("max-width: 100%");
    expect(css).toContain("overflow-x: hidden");
    expect(tracking).toContain('<main className="container py-8 sm:py-12">');
    expect(tracking).toContain('className="mx-auto mb-8 max-w-3xl');
    expect(staff).toContain('className="flex min-h-screen items-center justify-center bg-slate-50 p-4"');
    expect(staff).toContain('className="w-full max-w-md p-6 shadow-xl"');
    expect(customer).toContain('className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-50 to-white p-4"');
    expect(customer).toContain('className="w-full max-w-md border-white bg-white/95 p-6 shadow-2xl"');
  });

  it("keeps the full invoice directory collapsed by default behind a clear toggle", () => {
    const dashboard = source("client/src/pages/Dashboard.tsx");
    const followUp = dashboard.indexOf('data-testid="dashboard-follow-up-orders"');
    const toggle = dashboard.indexOf('data-testid="dashboard-all-invoices-toggle"');
    const panel = dashboard.indexOf('data-testid="dashboard-all-invoices-panel"');

    expect(dashboard).toContain("const [showAllInvoices, setShowAllInvoices] = useState(false)");
    expect(dashboard).toContain('data-testid="dashboard-all-invoices-button"');
    expect(dashboard).toContain('aria-expanded={showAllInvoices}');
    expect(dashboard).toContain('showAllInvoices ? "إخفاء جميع الفواتير" : "عرض جميع الفواتير"');
    expect(dashboard).toContain("{showAllInvoices && (");
    expect(followUp).toBeGreaterThan(-1);
    expect(toggle).toBeGreaterThan(followUp);
    expect(panel).toBeGreaterThan(toggle);
  });
});
