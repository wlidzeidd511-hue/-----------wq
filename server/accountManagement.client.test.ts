import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("owner account management controls", () => {
  const ownerControl = readFileSync(new URL("../client/src/pages/OwnerControl.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../client/src/pages/Dashboard.tsx", import.meta.url), "utf8");

  it("exposes safe staff deletion and permanent staff passwords", () => {
    expect(ownerControl).toContain("trpc.accounts.staff.remove.useMutation");
    expect(ownerControl).toContain("حذف الحساب");
    expect(ownerControl).toContain("سيُمنع دخوله فورًا مع بقاء سجلات الفواتير باسمه");
    expect(ownerControl).toContain("trpc.accounts.staff.setPassword.useMutation");
    expect(ownerControl).toContain("كلمة المرور الدائمة");
  });

  it("exposes branch and owner password changes", () => {
    expect(ownerControl).toContain("trpc.branchAccess.changePassword.useMutation");
    expect(ownerControl).toContain("حفظ كلمة حماية الفرع");
    expect(dashboard).toContain("trpc.owner.changePassword.useMutation");
    expect(dashboard).toContain("تغيير كلمة المرور");
    expect(dashboard).toContain("تم تغيير كلمة المرور وتحديث الجلسة");
  });
});
