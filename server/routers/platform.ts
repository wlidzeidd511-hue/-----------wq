import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { popupMessageCategories } from "../../drizzle/schema";
import { ownerBranchProcedure, ownerProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createBranch,
  createPopupMessage,
  deletePopupMessage,
  getOwnerWaitingScreen,
  getPopupMessageBranchId,
  getPublicWaitingScreen,
  getRandomPopupMessage,
  listAuditLogs,
  listBranches,
  listPopupCategorySettings,
  listPopupMessages,
  listWhatsappQueue,
  listWhatsappTemplates,
  getWhatsappQueueMessageBranchId,
  getWhatsappTemplateBranchId,
  markWhatsappManuallySent,
  updateBranch,
  updateBranchSettings,
  updateWaitingScreenContent,
  updatePopupMessage,
  setPopupCategoryState,
  updateWhatsappTemplate,
} from "../platformDb";
import { buildManualWhatsAppUrl } from "../notifications";
import { createDatabaseBackup, listDatabaseBackups, verifyDatabaseBackup } from "../backupDb";
import { ensureDailyBackupJobRow } from "../backupJobs";

const categorySchema = z.enum(popupMessageCategories);

function toPublicSettings<T extends Record<string, unknown>>(settings: T | null) {
  if (!settings) return settings;
  const {
    whatsappPhoneNumberId: _internalPhoneId,
    adminPasswordHash: _passwordHash,
    adminPasswordSalt: _passwordSalt,
    sessionVersion: _sessionVersion,
    ...publicSettings
  } = settings;
  return publicSettings;
}

function toOwnerSettings<T extends Record<string, unknown>>(settings: T | null) {
  if (!settings) return settings;
  const { adminPasswordHash: _passwordHash, adminPasswordSalt: _passwordSalt, sessionVersion: _sessionVersion, ...ownerSettings } = settings;
  return ownerSettings;
}

function toPublicBranch<T extends { settings: null | Record<string, unknown> }>(branch: T) {
  return { ...branch, settings: toPublicSettings(branch.settings) };
}

function toOwnerBranch<T extends { settings: null | Record<string, unknown> }>(branch: T | undefined) {
  if (!branch) throw new Error("Branch not found");
  if (!branch.settings) return { ...branch, protectionConfigured: false };
  return { ...branch, settings: toOwnerSettings(branch.settings), protectionConfigured: Boolean(branch.settings.adminPasswordHash) };
}

export const platformRouter = router({
  branches: router({
    publicList: publicProcedure.query(async () => (await listBranches()).map(toPublicBranch)),
    list: ownerProcedure.query(async () => (await listBranches(true)).map(toOwnerBranch)),
    create: ownerBranchProcedure
      .input(z.object({
        name: z.string().min(2).max(160),
        slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
        code: z.string().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
        sortOrder: z.number().int().min(0).max(1000).optional(),
      }))
      .mutation(async ({ input }) => toOwnerBranch(await createBranch(input))),
    update: ownerBranchProcedure
      .input(z.object({
        id: z.number().int().positive(),
        name: z.string().min(2).max(160).optional(),
        slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
        code: z.string().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/).optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(1000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.id !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تعديل فرع آخر" });
        const { id, ...updates } = input;
        return toOwnerBranch(await updateBranch(id, updates));
      }),
    updateSettings: ownerBranchProcedure
      .input(z.object({
        branchId: z.number().int().positive(),
        displayName: z.string().max(255).nullable().optional(),
        phone: z.string().max(30).nullable().optional(),
        whatsappPhone: z.string().max(30).nullable().optional(),
        address: z.string().max(2000).nullable().optional(),
        mapUrl: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
        mapsReviewUrl: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
        openingHours: z.string().max(2000).nullable().optional(),
        warrantyPolicy: z.string().max(4000).nullable().optional(),
        currency: z.string().min(1).max(10).optional(),
        invoicePrefix: z.string().max(20).nullable().optional(),
        waitingScreenEnabled: z.boolean().optional(),
        whatsappEnabled: z.boolean().optional(),
        whatsappPhoneNumberId: z.string().max(120).nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تعديل إعدادات فرع آخر" });
        const { branchId, ...settings } = input;
        return toOwnerBranch(await updateBranchSettings(branchId, {
          ...settings,
          mapUrl: settings.mapUrl === "" ? null : settings.mapUrl,
          mapsReviewUrl: settings.mapsReviewUrl === "" ? null : settings.mapsReviewUrl,
        }));
      }),
  }),
  content: router({
    waitingPublic: publicProcedure
      .input(z.object({ slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/) }))
      .query(async ({ input }) => {
        const result = await getPublicWaitingScreen(input.slug);
        return result ? { ...result, settings: toPublicSettings(result.settings) } : result;
      }),
    waitingOwner: ownerBranchProcedure
      .input(z.object({ branchId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        if (input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن عرض إعدادات فرع آخر" });
        const result = await getOwnerWaitingScreen(input.branchId);
        return result ? { ...result, branch: toOwnerBranch(result.branch) } : result;
      }),
    updateWaiting: ownerBranchProcedure
      .input(z.object({
        branchId: z.number().int().positive(),
        title: z.string().min(2).max(255),
        body: z.string().min(2).max(4000),
        isActive: z.boolean(),
      }))
      .mutation(({ input, ctx }) => {
        if (input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تعديل شاشة فرع آخر" });
        return updateWaitingScreenContent(input.branchId, { title: input.title, body: input.body, isActive: input.isActive });
      }),
  }),
  popups: router({
    random: publicProcedure
      .input(z.object({
        branchId: z.number().int().positive().optional(),
        category: categorySchema,
        excludeId: z.number().int().positive().optional(),
        statusKey: z.string().max(40).optional(),
      }))
      .query(({ input }) => getRandomPopupMessage(input)),
    list: ownerBranchProcedure
      .input(z.object({
        branchId: z.number().int().positive().nullable().optional(),
        category: categorySchema.optional(),
        includeInactive: z.boolean().optional(),
      }).optional())
      .query(({ input, ctx }) => {
        if (input?.branchId != null && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن عرض رسائل فرع آخر" });
        return listPopupMessages({ ...(input ?? {}), branchId: ctx.ownerBranch.branchId });
      }),
    categorySettings: ownerBranchProcedure.query(async ({ ctx }) => (await listPopupCategorySettings()).filter(item => item.branchId == null || item.branchId === ctx.ownerBranch.branchId)),
    setCategoryState: ownerBranchProcedure
      .input(z.object({
        branchId: z.number().int().positive().nullable().optional(),
        category: categorySchema,
        isActive: z.boolean(),
      }))
      .mutation(({ input, ctx }) => {
        if (input.branchId != null && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تعديل إعدادات فرع آخر" });
        return setPopupCategoryState({ ...input, branchId: ctx.ownerBranch.branchId });
      }),
    create: ownerBranchProcedure
      .input(z.object({
        branchId: z.number().int().positive().nullable().optional(),
        category: categorySchema,
        message: z.string().min(1).max(1000),
        weight: z.number().int().min(1).max(20).default(1),
        isActive: z.boolean().default(true),
      }))
      .mutation(({ input, ctx }) => {
        if (input.branchId != null && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن إنشاء رسالة لفرع آخر" });
        return createPopupMessage({ ...input, branchId: ctx.ownerBranch.branchId });
      }),
    update: ownerBranchProcedure
      .input(z.object({
        id: z.number().int().positive(),
        branchId: z.number().int().positive().nullable().optional(),
        category: categorySchema.optional(),
        message: z.string().min(1).max(1000).optional(),
        weight: z.number().int().min(1).max(20).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (await getPopupMessageBranchId(input.id) !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "الرسالة غير موجودة في الفرع المفتوح" });
        if (input.branchId != null && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن نقل الرسالة إلى فرع آخر" });
        const { id, ...updates } = input;
        return updatePopupMessage(id, { ...updates, branchId: ctx.ownerBranch.branchId });
      }),
    delete: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (await getPopupMessageBranchId(input.id) !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "الرسالة غير موجودة في الفرع المفتوح" });
        return deletePopupMessage(input.id);
      }),
  }),
  whatsapp: router({
    templates: ownerBranchProcedure
      .input(z.object({ branchId: z.number().int().positive().nullable().optional() }).optional())
      .query(({ input, ctx }) => {
        if (input?.branchId != null && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن عرض قوالب فرع آخر" });
        return listWhatsappTemplates(ctx.ownerBranch.branchId);
      }),
    updateTemplate: ownerBranchProcedure
      .input(z.object({
        id: z.number().int().positive(),
        branchId: z.number().int().positive().nullable().optional(),
        templateName: z.string().max(512).nullable().optional(),
        languageCode: z.string().min(2).max(20).optional(),
        bodyPreview: z.string().min(1).max(4000).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (await getWhatsappTemplateBranchId(input.id) !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "القالب غير موجود في الفرع المفتوح" });
        if (input.branchId != null && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن نقل القالب إلى فرع آخر" });
        const { id, ...updates } = input;
        return updateWhatsappTemplate(id, { ...updates, branchId: ctx.ownerBranch.branchId });
      }),
    queue: ownerBranchProcedure
      .input(z.object({ branchId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(500).default(200) }).optional())
      .query(async ({ input, ctx }) => {
        if (input?.branchId && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن عرض طابور فرع آخر" });
        return (await listWhatsappQueue(ctx.ownerBranch.branchId, input?.limit ?? 200)).map(message => ({ ...message, manualUrl: buildManualWhatsAppUrl(message.recipient, message.message) }));
      }),
    markManualSent: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (await getWhatsappQueueMessageBranchId(input.id) !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "الرسالة غير موجودة في طابور الفرع المفتوح" });
        return markWhatsappManuallySent(input.id);
      }),
  }),
  audit: ownerBranchProcedure
    .input(z.object({ branchId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(({ input, ctx }) => {
      if (input?.branchId && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن عرض سجل فرع آخر" });
      return listAuditLogs(ctx.ownerBranch.branchId, input?.limit ?? 100);
    }),
  backups: router({
    list: ownerBranchProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }).optional())
      .query(async ({ input }) => {
        await ensureDailyBackupJobRow();
        return listDatabaseBackups(input?.limit ?? 30);
      }),
    create: ownerBranchProcedure.mutation(() => createDatabaseBackup("manual")),
    verify: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => verifyDatabaseBackup(input.id)),
  }),
});
