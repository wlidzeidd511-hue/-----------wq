import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ownerBranchProcedure, router, staffPermissionProcedure } from "../_core/trpc";
import {
  archiveInternalAlert,
  createInternalAlert,
  getInternalAlertById,
  listInternalAlerts,
  softDeleteInternalAlert,
  updateInternalAlert,
} from "../internalAlertsDb";
import { getBranchById, writeAuditLog } from "../platformDb";

const alertTypeSchema = z.enum(["part_shortage", "important"]);
const prioritySchema = z.enum(["normal", "important", "urgent"]);
const statusSchema = z.enum(["missing", "ordered", "arrived", "resolved"]);

const createSchema = z.object({
  branchId: z.number().int().positive(),
  alertType: alertTypeSchema.default("part_shortage"),
  title: z.string().trim().min(2).max(255),
  partName: z.string().trim().max(255).nullable().optional(),
  quantity: z.number().int().min(1).max(9999).nullable().optional(),
  details: z.string().trim().max(4000).nullable().optional(),
  priority: prioritySchema.default("important"),
  status: statusSchema.default("missing"),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  alertType: alertTypeSchema.optional(),
  title: z.string().trim().min(2).max(255).optional(),
  partName: z.string().trim().max(255).nullable().optional(),
  quantity: z.number().int().min(1).max(9999).nullable().optional(),
  details: z.string().trim().max(4000).nullable().optional(),
  priority: prioritySchema.optional(),
  status: statusSchema.optional(),
});

async function assertBranch(branchId: number) {
  const branch = await getBranchById(branchId);
  if (!branch) throw new TRPCError({ code: "BAD_REQUEST", message: "الفرع غير موجود" });
}

export const internalAlertsRouter = router({
  owner: router({
    list: ownerBranchProcedure
      .input(z.object({
        branchId: z.number().int().positive().optional(),
        archived: z.boolean().default(false),
        deleted: z.boolean().default(false),
        status: statusSchema.optional(),
        alertType: alertTypeSchema.optional(),
      }).optional())
      .query(({ input, ctx }) => {
        if (input?.branchId && input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن عرض تنبيهات فرع آخر" });
        return listInternalAlerts({ ...(input ?? {}), branchId: ctx.ownerBranch.branchId });
      }),

    create: ownerBranchProcedure.input(createSchema).mutation(async ({ input, ctx }) => {
      if (input.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن إنشاء تنبيه لفرع آخر" });
      await assertBranch(input.branchId);
      const alert = await createInternalAlert(input, { type: "owner", name: "المالك" });
      if (!alert) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إنشاء التنبيه" });
      await writeAuditLog({ type: "owner", branchId: input.branchId }, "internal_alert.created", "internal_alert", alert.id, {
        alertType: input.alertType,
        priority: input.priority,
        status: input.status,
      });
      return alert;
    }),

    update: ownerBranchProcedure.input(updateSchema).mutation(async ({ input, ctx }) => {
      const current = await getInternalAlertById(input.id);
      if (!current || current.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "التنبيه غير موجود في الفرع المفتوح" });
      const { id, ...updates } = input;
      const alert = await updateInternalAlert(id, updates, { type: "owner", name: "المالك" });
      await writeAuditLog({ type: "owner", branchId: current.branchId }, "internal_alert.updated", "internal_alert", id, {
        fields: Object.keys(updates),
        fromStatus: current.status,
        toStatus: updates.status ?? current.status,
      });
      return alert;
    }),

    archive: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive(), archived: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const current = await getInternalAlertById(input.id);
        if (!current || current.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "التنبيه غير موجود في الفرع المفتوح" });
        const alert = await archiveInternalAlert(input.id, input.archived, { type: "owner", name: "المالك" });
        await writeAuditLog({ type: "owner", branchId: current.branchId }, input.archived ? "internal_alert.archived" : "internal_alert.restored", "internal_alert", input.id);
        return alert;
      }),

    remove: ownerBranchProcedure
      .input(z.object({ id: z.number().int().positive(), deleted: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const current = await getInternalAlertById(input.id);
        if (!current || current.branchId !== ctx.ownerBranch.branchId) throw new TRPCError({ code: "NOT_FOUND", message: "التنبيه غير موجود في الفرع المفتوح" });
        const alert = await softDeleteInternalAlert(input.id, input.deleted, { type: "owner", name: "المالك" });
        await writeAuditLog({ type: "owner", branchId: current.branchId }, input.deleted ? "internal_alert.deleted" : "internal_alert.recovered", "internal_alert", input.id);
        return alert;
      }),
  }),

  staff: router({
    list: staffPermissionProcedure("alerts.view")
      .input(z.object({ status: statusSchema.optional(), alertType: alertTypeSchema.optional() }).optional())
      .query(({ input, ctx }) => listInternalAlerts({ ...input, branchId: ctx.staff.branchId, archived: false, deleted: false })),

    create: staffPermissionProcedure("alerts.create")
      .input(createSchema.omit({ branchId: true }))
      .mutation(async ({ input, ctx }) => {
        const alert = await createInternalAlert({ ...input, branchId: ctx.staff.branchId }, {
          type: "staff",
          staffId: ctx.staff.id,
          name: ctx.staff.name,
        });
        if (!alert) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إنشاء التنبيه" });
        await writeAuditLog({ type: "staff", id: ctx.staff.id, branchId: ctx.staff.branchId }, "internal_alert.created", "internal_alert", alert.id, {
          alertType: input.alertType,
          priority: input.priority,
          status: input.status,
        });
        return alert;
      }),

    update: staffPermissionProcedure("alerts.update")
      .input(updateSchema)
      .mutation(async ({ input, ctx }) => {
        const current = await getInternalAlertById(input.id);
        if (!current || current.branchId !== ctx.staff.branchId || current.archived || current.deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "التنبيه غير موجود في فرعك" });
        }
        const { id, ...updates } = input;
        const alert = await updateInternalAlert(id, updates, {
          type: "staff",
          staffId: ctx.staff.id,
          name: ctx.staff.name,
        });
        await writeAuditLog({ type: "staff", id: ctx.staff.id, branchId: ctx.staff.branchId }, "internal_alert.updated", "internal_alert", id, {
          fields: Object.keys(updates),
          fromStatus: current.status,
          toStatus: updates.status ?? current.status,
        });
        return alert;
      }),

    remove: staffPermissionProcedure("alerts.delete")
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const current = await getInternalAlertById(input.id);
        if (!current || current.branchId !== ctx.staff.branchId || current.archived || current.deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "التنبيه غير موجود في فرعك" });
        }
        const alert = await softDeleteInternalAlert(input.id, true, {
          type: "staff",
          staffId: ctx.staff.id,
          name: ctx.staff.name,
        });
        await writeAuditLog({ type: "staff", id: ctx.staff.id, branchId: ctx.staff.branchId }, "internal_alert.deleted", "internal_alert", input.id);
        return alert;
      }),
  }),
});
