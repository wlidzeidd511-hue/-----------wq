import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lookup = readFileSync(new URL("../client/src/components/CustomerInvoiceLookup.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../client/src/pages/Dashboard.tsx", import.meta.url), "utf8");

describe("owner customer invoice lookup", () => {
  it("searches by phone and shows invoices, warranties, and undelivered totals", () => {
    expect(lookup).toContain("ownerSearchByPhone.useQuery");
    expect(lookup).toContain("الفواتير والأجهزة والضمانات");
    expect(lookup).toContain("فاتورة لم تُسلّم");
    expect(lookup).toContain("warrantyState");
  });

  it("sends a popup through the selected order only", () => {
    expect(lookup).toContain("engagement.sendToOrder.useMutation");
    expect(lookup).toContain("orderId: selectedOrderId");
    expect(lookup).toContain("لن تظهر الرسالة في أي فاتورة أخرى");
    expect(lookup).toContain("order.isUndelivered && !order.archived");
  });

  it("appears as a standalone owner search and inside new invoice phone entry", () => {
    expect(dashboard).toContain("<CustomerInvoiceLookup />");
    expect(dashboard).toContain("<CustomerInvoiceLookup phone={orderForm.customerPhone} compact />");
  });
});
