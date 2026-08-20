import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SUPER_ADMIN_CHALLENGE_COOKIE,
  SUPER_ADMIN_SESSION_COOKIE,
  createSuperAdminChallengeToken,
  createSuperAdminSessionToken,
  readSuperAdminChallenge,
  readSuperAdminSession,
} from "./superAdminAuth";
import { resolveWebAuthnRequestConfig } from "./routers/superAdmin";

const routerSource = readFileSync(new URL("./routers/superAdmin.ts", import.meta.url), "utf8");
const portalSource = readFileSync(new URL("../client/src/pages/SuperAdminPortal.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../client/public/owner-control.webmanifest", import.meta.url), "utf8"));

function requestWithCookie(name: string, value: string) {
  return { headers: { cookie: `${name}=${encodeURIComponent(value)}` } } as any;
}

describe("passwordless owner super admin portal", () => {
  it("signs and verifies short-lived challenge and super-admin session cookies", async () => {
    const challengeToken = await createSuperAdminChallengeToken({
      flow: "authentication",
      challenge: "challenge-value",
    });
    await expect(readSuperAdminChallenge(requestWithCookie(SUPER_ADMIN_CHALLENGE_COOKIE, challengeToken))).resolves.toMatchObject({
      kind: "super_admin_challenge",
      flow: "authentication",
      challenge: "challenge-value",
    });

    const sessionToken = await createSuperAdminSessionToken(7, "a".repeat(64));
    await expect(readSuperAdminSession(requestWithCookie(SUPER_ADMIN_SESSION_COOKIE, sessionToken))).resolves.toEqual({
      kind: "super_admin",
      sessionVersion: 7,
      credentialIdHash: "a".repeat(64),
    });
  });

  it("issues existing owner and branch sessions after Passkey without changing passwords", () => {
    expect(routerSource).toContain("verifyAuthenticationResponse");
    expect(routerSource).toContain("requireUserVerification: true");
    expect(routerSource).toContain("createOwnerSessionToken(settings.sessionVersion)");
    expect(routerSource).toContain("createBranchSessionToken(branch.id, branch.sessionVersion ?? 1)");
    expect(routerSource).toContain("passwordChanged: false");
    expect(routerSource).not.toContain("changeOwnerPassword");
    expect(routerSource).not.toContain("changeBranchProtection");
    expect(portalSource).not.toContain('type="password"');
    expect(portalSource).toContain("كلمات حماية الفروع والمالك والموظفين باقية كما هي ولم تتغير");
  });

  it("keeps the private portal out of the public homepage and gives it a standalone manifest", () => {
    expect(appSource).toContain('<Route path={SUPER_ADMIN_PATH} component={SuperAdminPortal} />');
    expect(homeSource).not.toContain("SUPER_ADMIN_PATH");
    expect(portalSource).toContain('/owner-control.webmanifest?v=2');
    expect(manifest.id).toBe("/owner-vault?v=2");
    expect(manifest.start_url).toBe("/owner-vault");
    expect(manifest.display).toBe("standalone");
  });

  it("trusts only approved WebAuthn origins when the production proxy rewrites Host", () => {
    expect(resolveWebAuthnRequestConfig({
      hostname: "internal-service",
      origin: "https://hatfaltmyez.com",
    })).toEqual({
      rpID: "hatfaltmyez.com",
      expectedOrigin: ["https://hatfaltmyez.com", "https://www.hatfaltmyez.com"],
    });
    expect(resolveWebAuthnRequestConfig({
      hostname: "internal-service",
      origin: "https://3000-example.manus.computer",
    })).toEqual({
      rpID: "3000-example.manus.computer",
      expectedOrigin: "https://3000-example.manus.computer",
    });
    expect(() => resolveWebAuthnRequestConfig({
      hostname: "internal-service",
      origin: "https://evil.example",
    })).toThrow("نطاق بوابة المالك غير معتمد");
  });
});
