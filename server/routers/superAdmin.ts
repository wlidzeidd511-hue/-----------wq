import type { Request } from "express";
import { TRPCError } from "@trpc/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticationExtensionsClientOutputs,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";
import { OWNER_SESSION_COOKIE, OWNER_SESSION_TTL_MS, createOwnerSessionToken } from "../adminAuth";
import { BRANCH_SESSION_COOKIE, BRANCH_SESSION_TTL_MS, createBranchSessionToken } from "../branchAuth";
import { getBranchProtection, listBranchProtectionStates } from "../branchAccessDb";
import { assertLoginAllowed, recordLoginFailure, recordLoginSuccess } from "../authRateLimit";
import { getSessionCookieOptions } from "../_core/cookies";
import { publicProcedure, router, superAdminProcedure } from "../_core/trpc";
import { writeAuditLog } from "../platformDb";
import { getShopSettings } from "../settingsDb";
import {
  consumeEnrollmentAndSaveOwnerPasskey,
  ensureOwnerSecuritySettings,
  findActiveOwnerPasskey,
  hashCredentialId,
  listActiveOwnerPasskeys,
  ownerPasskeyStatus,
  ownerPasskeyToCredential,
  recordOwnerPasskeyUse,
  validateOwnerEnrollmentToken,
} from "../superAdminDb";
import {
  SUPER_ADMIN_CHALLENGE_COOKIE,
  SUPER_ADMIN_CHALLENGE_TTL_MS,
  SUPER_ADMIN_SESSION_COOKIE,
  SUPER_ADMIN_SESSION_TTL_MS,
  createSuperAdminChallengeToken,
  createSuperAdminSessionToken,
  readSuperAdminChallenge,
} from "../superAdminAuth";

const transportSchema = z.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
const base64urlSchema = z.string().min(1).max(131_072).regex(/^[A-Za-z0-9_-]+$/);
const extensionResultsSchema = z.custom<AuthenticationExtensionsClientOutputs>(
  value => typeof value === "object" && value !== null && !Array.isArray(value),
  "نتائج إضافات WebAuthn غير صالحة",
);

const registrationResponseSchema = z.object({
  id: base64urlSchema.max(1_024),
  rawId: base64urlSchema.max(1_024),
  response: z.object({
    clientDataJSON: base64urlSchema.max(16_384),
    attestationObject: base64urlSchema,
    authenticatorData: base64urlSchema.max(16_384).optional(),
    transports: z.array(transportSchema).max(8).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: base64urlSchema.optional(),
  }).strict(),
  type: z.literal("public-key"),
  clientExtensionResults: extensionResultsSchema,
  authenticatorAttachment: z.enum(["cross-platform", "platform"]).nullable().optional(),
}).strict();

const authenticationResponseSchema = z.object({
  id: base64urlSchema.max(1_024),
  rawId: base64urlSchema.max(1_024),
  response: z.object({
    clientDataJSON: base64urlSchema.max(16_384),
    authenticatorData: base64urlSchema.max(16_384),
    signature: base64urlSchema.max(16_384),
    userHandle: base64urlSchema.max(1_024).nullable().optional(),
  }).strict(),
  type: z.literal("public-key"),
  clientExtensionResults: extensionResultsSchema,
  authenticatorAttachment: z.enum(["cross-platform", "platform"]).nullable().optional(),
}).strict();

const enrollmentTokenSchema = z.string().trim().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/);
const LOGIN_IDENTIFIER = "super-admin-passkey";

type WebAuthnRequestIdentity = {
  hostname: string;
  host?: string;
  origin?: string;
};

export function resolveWebAuthnRequestConfig(identity: WebAuthnRequestIdentity) {
  const hostname = identity.hostname.toLowerCase();
  const origin = identity.origin?.trim().toLowerCase();
  if (origin === "https://hatfaltmyez.com" || origin === "https://www.hatfaltmyez.com") {
    return {
      rpID: "hatfaltmyez.com",
      expectedOrigin: ["https://hatfaltmyez.com", "https://www.hatfaltmyez.com"],
    };
  }
  if (!origin && (hostname === "hatfaltmyez.com" || hostname === "www.hatfaltmyez.com")) {
    return {
      rpID: "hatfaltmyez.com",
      expectedOrigin: ["https://hatfaltmyez.com", "https://www.hatfaltmyez.com"],
    };
  }

  let originUrl: URL | null = null;
  try {
    originUrl = origin ? new URL(origin) : null;
  } catch {
    originUrl = null;
  }
  const originHostname = originUrl?.hostname.toLowerCase();
  if (originUrl?.protocol === "http:" && (originHostname === "localhost" || originHostname === "127.0.0.1")) {
    return { rpID: "localhost", expectedOrigin: originUrl.origin };
  }
  if (originUrl?.protocol === "https:" && originHostname && (originHostname.endsWith(".manus.computer") || originHostname.endsWith(".manus.space"))) {
    return { rpID: originHostname, expectedOrigin: originUrl.origin };
  }

  if (!origin && (hostname === "localhost" || hostname === "127.0.0.1")) {
    const host = identity.host ?? hostname;
    return { rpID: "localhost", expectedOrigin: `http://${host}` };
  }
  if (!origin && (hostname.endsWith(".manus.computer") || hostname.endsWith(".manus.space"))) {
    return { rpID: hostname, expectedOrigin: `https://${hostname}` };
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "نطاق بوابة المالك غير معتمد" });
}

function webAuthnRequestConfig(req: Request) {
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  return resolveWebAuthnRequestConfig({
    hostname: req.hostname,
    host: String(req.headers.host ?? ""),
    origin,
  });
}

function setChallengeCookie(ctx: { req: Request; res: { cookie: Function } }, token: string) {
  ctx.res.cookie(SUPER_ADMIN_CHALLENGE_COOKIE, token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: SUPER_ADMIN_CHALLENGE_TTL_MS,
  });
}

function clearChallengeCookie(ctx: { req: Request; res: { clearCookie: Function } }) {
  ctx.res.clearCookie(SUPER_ADMIN_CHALLENGE_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
}

export const superAdminRouter = router({
  status: publicProcedure.query(() => ownerPasskeyStatus()),
  registrationOptions: publicProcedure
    .input(z.object({ token: enrollmentTokenSchema }).strict())
    .mutation(async ({ input, ctx }) => {
      await assertLoginAllowed(ctx.req, "owner", `${LOGIN_IDENTIFIER}-enrollment`);
      const enrollment = await validateOwnerEnrollmentToken(input.token);
      if (!enrollment) {
        await recordLoginFailure(ctx.req, "owner", `${LOGIN_IDENTIFIER}-enrollment`);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "رابط التفعيل غير صالح أو انتهت مدته" });
      }
      const { rpID } = webAuthnRequestConfig(ctx.req);
      const passkeys = await listActiveOwnerPasskeys();
      const options = await generateRegistrationOptions({
        rpName: "تحكم مالك هاتف التميز",
        rpID,
        userName: "owner@hatfaltmyez.com",
        userDisplayName: "مالك هاتف التميز",
        attestationType: "none",
        timeout: 60_000,
        excludeCredentials: passkeys.map(passkey => ({
          id: passkey.credentialId,
          transports: passkey.transports ? JSON.parse(passkey.transports) as AuthenticatorTransportFuture[] : undefined,
        })),
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        preferredAuthenticatorType: "localDevice",
      });
      const challengeToken = await createSuperAdminChallengeToken({
        flow: "registration",
        challenge: options.challenge,
        enrollmentTokenHash: enrollment.tokenHash,
        webauthnUserId: options.user.id,
      });
      setChallengeCookie(ctx, challengeToken);
      return options;
    }),
  verifyRegistration: publicProcedure
    .input(z.object({ response: registrationResponseSchema, deviceName: z.string().trim().min(1).max(160).optional() }).strict())
    .mutation(async ({ input, ctx }) => {
      const challenge = await readSuperAdminChallenge(ctx.req);
      if (!challenge || challenge.flow !== "registration" || !challenge.enrollmentTokenHash || !challenge.webauthnUserId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "جلسة تفعيل البصمة منتهية" });
      }
      clearChallengeCookie(ctx);
      const security = await ensureOwnerSecuritySettings();
      if (
        security.enrollmentTokenHash !== challenge.enrollmentTokenHash ||
        !security.enrollmentExpiresAt ||
        security.enrollmentExpiresAt <= Date.now()
      ) {
        await recordLoginFailure(ctx.req, "owner", `${LOGIN_IDENTIFIER}-enrollment`);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "رابط التفعيل غير صالح أو انتهت مدته" });
      }
      const { rpID, expectedOrigin } = webAuthnRequestConfig(ctx.req);
      try {
        const verification = await verifyRegistrationResponse({
          response: input.response as RegistrationResponseJSON,
          expectedChallenge: challenge.challenge,
          expectedOrigin,
          expectedRPID: rpID,
          requireUserPresence: true,
          requireUserVerification: true,
        });
        if (!verification.verified || !verification.registrationInfo.userVerified) {
          await recordLoginFailure(ctx.req, "owner", `${LOGIN_IDENTIFIER}-enrollment`);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "تعذر التحقق من بصمة الجهاز" });
        }
        const info = verification.registrationInfo;
        const saved = await consumeEnrollmentAndSaveOwnerPasskey({
          credentialId: info.credential.id,
          publicKey: info.credential.publicKey,
          webauthnUserId: challenge.webauthnUserId,
          counter: info.credential.counter,
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
          transports: input.response.response.transports as AuthenticatorTransportFuture[] | undefined,
          enrollmentTokenHash: challenge.enrollmentTokenHash,
          displayName: input.deviceName,
        });
        await recordLoginSuccess(ctx.req, "owner", `${LOGIN_IDENTIFIER}-enrollment`);
        await writeAuditLog({ type: "owner" }, "super_admin.passkey.registered", "owner_passkey", saved.credentialIdHash, {
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
        });
        const securityAfterEnrollment = await ensureOwnerSecuritySettings();
        const sessionToken = await createSuperAdminSessionToken(securityAfterEnrollment.sessionVersion, saved.credentialIdHash);
        ctx.res.cookie(SUPER_ADMIN_SESSION_COOKIE, sessionToken, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: SUPER_ADMIN_SESSION_TTL_MS,
        });
        return { verified: true as const, authenticated: true as const };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        await recordLoginFailure(ctx.req, "owner", `${LOGIN_IDENTIFIER}-enrollment`);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "تعذر تسجيل بصمة الجهاز" });
      }
    }),
  authenticationOptions: publicProcedure.mutation(async ({ ctx }) => {
    await assertLoginAllowed(ctx.req, "owner", LOGIN_IDENTIFIER);
    const passkeys = await listActiveOwnerPasskeys();
    if (!passkeys.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لم تُفعّل بصمة المالك بعد" });
    const { rpID } = webAuthnRequestConfig(ctx.req);
    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60_000,
      userVerification: "required",
    });
    const challengeToken = await createSuperAdminChallengeToken({ flow: "authentication", challenge: options.challenge });
    setChallengeCookie(ctx, challengeToken);
    return options;
  }),
  verifyAuthentication: publicProcedure
    .input(z.object({ response: authenticationResponseSchema }).strict())
    .mutation(async ({ input, ctx }) => {
      const challenge = await readSuperAdminChallenge(ctx.req);
      if (!challenge || challenge.flow !== "authentication") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "جلسة البصمة منتهية" });
      }
      clearChallengeCookie(ctx);
      await assertLoginAllowed(ctx.req, "owner", LOGIN_IDENTIFIER);
      const response = input.response as AuthenticationResponseJSON;
      const passkey = await findActiveOwnerPasskey(response.id);
      if (!passkey) {
        await recordLoginFailure(ctx.req, "owner", LOGIN_IDENTIFIER);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "مفتاح المرور غير مسجل للمالك" });
      }
      const { rpID, expectedOrigin } = webAuthnRequestConfig(ctx.req);
      try {
        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge.challenge,
          expectedOrigin,
          expectedRPID: rpID,
          credential: ownerPasskeyToCredential(passkey),
          requireUserVerification: true,
        });
        if (!verification.verified || !verification.authenticationInfo.userVerified) {
          await recordLoginFailure(ctx.req, "owner", LOGIN_IDENTIFIER);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "تعذر التحقق من بصمة الجهاز" });
        }
        await recordOwnerPasskeyUse(passkey.id, verification.authenticationInfo.newCounter);
        const security = await ensureOwnerSecuritySettings();
        const credentialIdHash = hashCredentialId(passkey.credentialId);
        const sessionToken = await createSuperAdminSessionToken(security.sessionVersion, credentialIdHash);
        ctx.res.cookie(SUPER_ADMIN_SESSION_COOKIE, sessionToken, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: SUPER_ADMIN_SESSION_TTL_MS,
        });
        await recordLoginSuccess(ctx.req, "owner", LOGIN_IDENTIFIER);
        await writeAuditLog({ type: "owner" }, "super_admin.passkey.authenticated", "owner_passkey", String(passkey.id));
        return { authenticated: true as const };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        await recordLoginFailure(ctx.req, "owner", LOGIN_IDENTIFIER);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "فشل التحقق من بصمة الجهاز" });
      }
    }),
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.superAdminSession) return { authenticated: false as const, devices: [] };
    const security = await ensureOwnerSecuritySettings();
    if (ctx.superAdminSession.sessionVersion !== security.sessionVersion) return { authenticated: false as const, devices: [] };
    const passkeys = await listActiveOwnerPasskeys();
    const active = passkeys.some(passkey => passkey.credentialIdHash === ctx.superAdminSession?.credentialIdHash);
    if (!active) return { authenticated: false as const, devices: [] };
    return {
      authenticated: true as const,
      devices: passkeys.map(passkey => ({ id: passkey.id, displayName: passkey.displayName, createdAt: passkey.createdAt, lastUsedAt: passkey.lastUsedAt })),
    };
  }),
  branches: superAdminProcedure.query(() => listBranchProtectionStates()),
  enterBranch: superAdminProcedure
    .input(z.object({ branchId: z.number().int().positive() }).strict())
    .mutation(async ({ input, ctx }) => {
      const branch = await getBranchProtection(input.branchId);
      if (!branch) throw new TRPCError({ code: "NOT_FOUND", message: "الفرع غير موجود أو غير نشط" });
      const settings = await getShopSettings();
      const ownerToken = await createOwnerSessionToken(settings.sessionVersion);
      const branchToken = await createBranchSessionToken(branch.id, branch.sessionVersion ?? 1);
      ctx.res.cookie(OWNER_SESSION_COOKIE, ownerToken, { ...getSessionCookieOptions(ctx.req), maxAge: OWNER_SESSION_TTL_MS });
      ctx.res.cookie(BRANCH_SESSION_COOKIE, branchToken, { ...getSessionCookieOptions(ctx.req), maxAge: BRANCH_SESSION_TTL_MS });
      await writeAuditLog({ type: "owner", branchId: branch.id }, "super_admin.branch.entered", "branch", branch.id, {
        passwordChanged: false,
        passkeyCredential: ctx.superAdminSession.credentialIdHash.slice(0, 12),
      });
      return { branch: { branchId: branch.id, branchName: branch.name } };
    }),
  logout: publicProcedure.mutation(({ ctx }) => {
    for (const cookieName of [SUPER_ADMIN_SESSION_COOKIE, SUPER_ADMIN_CHALLENGE_COOKIE, OWNER_SESSION_COOKIE, BRANCH_SESSION_COOKIE]) {
      ctx.res.clearCookie(cookieName, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
    }
    return { success: true as const };
  }),
});
