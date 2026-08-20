import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("Owner entry flow", () => {
  it("uses an icon-only owner entry that targets the private login path", () => {
    const home = readProjectFile("client/src/pages/Home.tsx");

    expect(home).toContain('href={OWNER_LOGIN_PATH}');
    expect(home).toContain('aria-label="دخول المالك"');
    expect(home).not.toContain('href="/dashboard/control"');
    expect(home).not.toContain('>الطلبات</Link>');
  });

  it("redirects unauthenticated owner-control visits instead of rendering blank", () => {
    const ownerControl = readProjectFile("client/src/pages/OwnerControl.tsx");

    expect(ownerControl).toContain('if (!ownerQuery.isLoading && !authenticated) navigate(OWNER_LOGIN_PATH)');
    expect(ownerControl).toContain('ownerQuery.isLoading || (authenticated && branchAccessQuery.isLoading) || !authenticated || !branchAuthenticated || !branchId');
    expect(ownerControl).toContain('navigate("/dashboard/branches")');
    expect(ownerControl).not.toContain('if (!authenticated) return null');
  });

  it("sends an authenticated owner to the protected branch selector", () => {
    const adminLogin = readProjectFile("client/src/pages/AdminLogin.tsx");

    expect(adminLogin).toContain('navigate("/dashboard/branches")');
  });
});
