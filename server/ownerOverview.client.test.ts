import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("owner overview dashboard cards", () => {
  const source = readFileSync(new URL("../client/src/pages/Dashboard.tsx", import.meta.url), "utf8");

  it("renders branch-scoped maintenance, visitors, online, and account totals", () => {
    expect(source).toContain("trpc.ownerMetrics.overview.useQuery");
    expect(source).toContain("أجهزة الصيانة المنجزة");
    expect(source).toContain("إجمالي زوار الموقع");
    expect(source).toContain("داخل الموقع الآن");
    expect(source).toContain("الحسابات الموجودة");
    expect(source).toContain("customerAccounts");
    expect(source).toContain("activeStaffAccounts");
    expect(source).toContain("آخر نشاط خلال 90 ثانية");
    expect(source).toContain('aria-label="إحصاءات الموقع والحسابات"');
    expect(source).toContain('className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"');
  });
});
