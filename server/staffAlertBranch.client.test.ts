import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "client/src/components/InternalAlertsPanel.tsx"), "utf8");
const staffPortal = readFileSync(resolve(process.cwd(), "client/src/pages/StaffPortal.tsx"), "utf8");

describe("staff alert branch binding", () => {
  it("binds the staff alert form to the authenticated staff branch", () => {
    expect(staffPortal).toContain("branchId={staff.branchId}");
    expect(staffPortal).toContain("branchName={staffBranch?.name");
    expect(panel).toContain('data-testid="staff-alert-fixed-branch"');
    expect(panel).toContain("fixedBranch={{ id: branchId, name: branchName }}");
    expect(panel).toContain("form.branchId || fixedBranch?.id");
    expect(panel).toContain("internalAlerts.staff.remove.useMutation");
    expect(panel).toContain('canDelete={canDelete}');
    expect(staffPortal).toContain('permissionsList.includes("alerts.delete")');
  });

  it("keeps branch selection for the owner and strips branch input from the staff API", () => {
    expect(panel).toContain("!editing && branches &&");
    expect(panel).toContain("const { branchId: _branchId, ...payload } = input");
    expect(panel).toContain("createMutation.mutateAsync(payload)");
  });
});
