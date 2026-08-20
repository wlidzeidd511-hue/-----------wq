import { randomBytes } from "node:crypto";
import { asc, eq, inArray, isNull } from "drizzle-orm";
import { customers, serviceOrders, staffAccounts, staffBranchAssignments } from "../drizzle/schema";
import { hashOwnerPassword, verifyOwnerPassword } from "./adminAuth";
import { getDb } from "./db";
import { writeAuditLog } from "./platformDb";

export const STAFF_PERMISSION_KEYS = [
  "orders.view_branch",
  "orders.create",
  "orders.update_intake",
  "orders.update_status",
  "orders.view_prices",
  "orders.view_internal_notes",
  "customers.view",
  "customers.create",
  "photos.upload",
  "photos.view",
  "alerts.view",
  "alerts.create",
  "alerts.update",
  "alerts.delete",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSION_KEYS)[number];

export const STAFF_USERNAME_PATTERN = /^[A-Za-z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF._-]+$/;
export const DEFAULT_STAFF_PASSWORD = "12Qwaszx*";

export function normalizeStaffUsername(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, "").toLowerCase();
}

export class StaffUsernameTakenError extends Error {
  constructor() {
    super("اسم الدخول مستخدم من موظف آخر");
    this.name = "StaffUsernameTakenError";
  }
}

export const DEFAULT_STAFF_PERMISSIONS: StaffPermission[] = [
  "orders.view_branch",
  "orders.create",
  "orders.update_intake",
  "customers.create",
  "photos.upload",
  "photos.view",
  "alerts.view",
  "alerts.create",
  "alerts.update",
];

const LEGACY_DEFAULT_STAFF_PERMISSIONS = [
  "orders.view_branch",
  "orders.create",
  "orders.update_intake",
  "customers.create",
  "photos.upload",
  "photos.view",
] as const;

export function normalizeSaudiPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("05")) return `966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `966${digits}`;
  return digits;
}

export function generateTemporaryPassword(length = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

export function parseStaffPermissions(raw: string): StaffPermission[] {
  try {
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    const parsed = values.filter((value): value is StaffPermission =>
      STAFF_PERMISSION_KEYS.includes(value as StaffPermission),
    );
    if (LEGACY_DEFAULT_STAFF_PERMISSIONS.every(permission => parsed.includes(permission))) {
      for (const permission of ["alerts.view", "alerts.create", "alerts.update"] as const) {
        if (!parsed.includes(permission)) parsed.push(permission);
      }
    }
    return parsed;
  } catch {
    return [];
  }
}

async function getStaffRecordById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [staff] = await db.select().from(staffAccounts).where(eq(staffAccounts.id, id)).limit(1);
  return staff;
}

export async function getStaffById(id: number) {
  const staff = await getStaffRecordById(id);
  if (!staff) return undefined;
  const { passwordHash: _hash, passwordSalt: _salt, ...safe } = staff;
  return { ...safe, permissionsList: parseStaffPermissions(staff.permissions) };
}

async function getCustomerRecordById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return customer;
}

export async function getCustomerById(id: number) {
  const customer = await getCustomerRecordById(id);
  if (!customer) return undefined;
  const { passwordHash: _hash, passwordSalt: _salt, ...safe } = customer;
  return safe;
}

export async function findCustomerByPhone(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = normalizeSaudiPhone(phone);
  if (!normalized) return undefined;
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.phoneNormalized, normalized))
    .limit(1);
  return customer;
}

async function linkMatchingOrdersToCustomer(customerId: number, phoneNormalized: string) {
  const db = await getDb();
  if (!db) return 0;
  const unlinked = await db
    .select({ id: serviceOrders.id, customerPhone: serviceOrders.customerPhone })
    .from(serviceOrders)
    .where(isNull(serviceOrders.customerId));
  const ids = unlinked
    .filter(order => order.customerPhone && normalizeSaudiPhone(order.customerPhone) === phoneNormalized)
    .map(order => order.id);
  if (!ids.length) return 0;
  await db.update(serviceOrders).set({ customerId }).where(inArray(serviceOrders.id, ids));
  return ids.length;
}

export async function createOrGetCustomer(input: {
  phone: string;
  name?: string | null;
  whatsappOptIn?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const phoneNormalized = normalizeSaudiPhone(input.phone);
  if (phoneNormalized.length < 9) throw new Error("INVALID_PHONE");
  const existing = await findCustomerByPhone(phoneNormalized);
  if (existing) {
    const updates: Record<string, unknown> = {};
    if (input.name?.trim() && input.name.trim() !== existing.name) updates.name = input.name.trim();
    if (input.whatsappOptIn && !existing.whatsappOptIn) updates.whatsappOptIn = true;
    if (Object.keys(updates).length) {
      await db.update(customers).set(updates).where(eq(customers.id, existing.id));
    }
    await linkMatchingOrdersToCustomer(existing.id, phoneNormalized);
    return { customer: (await getCustomerById(existing.id))!, temporaryPassword: null, created: false as const };
  }

  const temporaryPassword = generateTemporaryPassword();
  const password = await hashOwnerPassword(temporaryPassword);
  const result = await db.insert(customers).values({
    phoneNormalized,
    phoneDisplay: input.phone,
    name: input.name?.trim() || null,
    passwordHash: password.hash,
    passwordSalt: password.salt,
    passwordNeedsReset: true,
    whatsappOptIn: input.whatsappOptIn ?? false,
  });
  const id = Number(result[0].insertId);
  await linkMatchingOrdersToCustomer(id, phoneNormalized);
  await writeAuditLog({ type: "system" }, "customer.created", "customer", id, {
    phoneLast4: phoneNormalized.slice(-4),
  });
  return { customer: (await getCustomerById(id))!, temporaryPassword, created: true as const };
}

export async function authenticateCustomer(phone: string, password: string) {
  const db = await getDb();
  if (!db) return undefined;
  const customer = await findCustomerByPhone(phone);
  if (!customer || !customer.isActive) return undefined;
  const valid = await verifyOwnerPassword(password, customer.passwordHash, customer.passwordSalt);
  if (!valid) return undefined;
  await db.update(customers).set({ lastLoginAt: Date.now() }).where(eq(customers.id, customer.id));
  return getCustomerById(customer.id);
}

export async function changeCustomerPassword(id: number, currentPassword: string, newPassword: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const customer = await getCustomerRecordById(id);
  if (!customer) return undefined;
  const valid = await verifyOwnerPassword(currentPassword, customer.passwordHash, customer.passwordSalt);
  if (!valid) return undefined;
  const password = await hashOwnerPassword(newPassword);
  await db
    .update(customers)
    .set({
      passwordHash: password.hash,
      passwordSalt: password.salt,
      passwordNeedsReset: false,
      sessionVersion: customer.sessionVersion + 1,
    })
    .where(eq(customers.id, id));
  await writeAuditLog({ type: "customer", id }, "customer.password.changed", "customer", id);
  return getCustomerById(id);
}

export async function listStaffAccounts(branchId?: number, includeInactive = true, includeDeleted = false) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(staffAccounts)
    .where(branchId ? eq(staffAccounts.branchId, branchId) : undefined)
    .orderBy(asc(staffAccounts.name));
  return rows
    .filter(row => includeDeleted || row.roleKey !== "deleted")
    .filter(row => includeInactive || row.isActive)
    .map(({ passwordHash: _hash, passwordSalt: _salt, ...row }) => ({
      ...row,
      permissionsList: parseStaffPermissions(row.permissions),
    }));
}

export async function createStaffAccount(input: {
  branchId: number;
  name: string;
  username: string;
  phone?: string | null;
  jobTitle?: string | null;
  roleKey?: string;
  permissions?: StaffPermission[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const username = normalizeStaffUsername(input.username);
  const [existing] = await db.select({ id: staffAccounts.id }).from(staffAccounts).where(eq(staffAccounts.username, username)).limit(1);
  if (existing) throw new StaffUsernameTakenError();
  const temporaryPassword = DEFAULT_STAFF_PASSWORD;
  const password = await hashOwnerPassword(temporaryPassword);
  const permissions = input.permissions ?? DEFAULT_STAFF_PERMISSIONS;
  const result = await db.insert(staffAccounts).values({
    branchId: input.branchId,
    name: input.name.trim(),
    username,
    phone: input.phone ?? null,
    jobTitle: input.jobTitle ?? null,
    roleKey: input.roleKey ?? "employee",
    permissions: JSON.stringify(permissions),
    passwordHash: password.hash,
    passwordSalt: password.salt,
  });
  const id = Number(result[0].insertId);
  await db.insert(staffBranchAssignments).values({ staffId: id, branchId: input.branchId, isPrimary: true });
  await writeAuditLog({ type: "owner", branchId: input.branchId }, "staff.created", "staff", id, {
    name: input.name,
    username: input.username,
    permissions,
  });
  return { staff: await getStaffById(id), temporaryPassword };
}

export async function authenticateStaff(username: string, password: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [staff] = await db
    .select()
    .from(staffAccounts)
    .where(eq(staffAccounts.username, normalizeStaffUsername(username)))
    .limit(1);
  if (!staff || !staff.isActive) return undefined;
  const valid = await verifyOwnerPassword(password, staff.passwordHash, staff.passwordSalt);
  if (!valid) return undefined;
  await db.update(staffAccounts).set({ lastLoginAt: Date.now() }).where(eq(staffAccounts.id, staff.id));
  return getStaffById(staff.id);
}

export async function updateStaffAccount(
  id: number,
  input: Partial<{
    branchId: number;
    name: string;
    username: string;
    phone: string | null;
    jobTitle: string | null;
    roleKey: string;
    permissions: StaffPermission[];
    isActive: boolean;
  }>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const staff = await getStaffRecordById(id);
  if (!staff) return undefined;
  const nextUsername = input.username === undefined ? undefined : normalizeStaffUsername(input.username);
  if (nextUsername) {
    const [existing] = await db.select({ id: staffAccounts.id }).from(staffAccounts).where(eq(staffAccounts.username, nextUsername)).limit(1);
    if (existing && existing.id !== id) throw new StaffUsernameTakenError();
  }
  const { permissions, username: _username, ...fields } = input;
  const usernameChanged = Boolean(nextUsername && nextUsername !== staff.username);
  const authorizationChanged = permissions !== undefined
    || input.isActive !== undefined
    || input.branchId !== undefined
    || input.roleKey !== undefined;
  const sessionRevoked = usernameChanged || authorizationChanged;
  await db
    .update(staffAccounts)
    .set({
      ...fields,
      ...(nextUsername ? { username: nextUsername } : {}),
      ...(permissions ? { permissions: JSON.stringify(permissions) } : {}),
      ...(sessionRevoked ? { sessionVersion: staff.sessionVersion + 1 } : {}),
    })
    .where(eq(staffAccounts.id, id));
  if (input.branchId) {
    await db
      .insert(staffBranchAssignments)
      .values({ staffId: id, branchId: input.branchId, isPrimary: true })
      .onDuplicateKeyUpdate({ set: { isPrimary: true } });
  }
  await writeAuditLog({ type: "owner", branchId: input.branchId }, "staff.updated", "staff", id, {
    fields: Object.keys(input),
    sessionRevoked,
  });
  return getStaffById(id);
}

export async function transferStaffAccount(id: number, targetBranchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const staff = await getStaffRecordById(id);
  if (!staff || staff.roleKey === "deleted") return undefined;
  if (staff.branchId === targetBranchId) {
    return { staff: await getStaffById(id), previousBranchId: staff.branchId, targetBranchId, sessionVersion: staff.sessionVersion };
  }

  const previousBranchId = staff.branchId;
  const sessionVersion = staff.sessionVersion + 1;
  await db.transaction(async tx => {
    await tx
      .update(staffAccounts)
      .set({ branchId: targetBranchId, sessionVersion })
      .where(eq(staffAccounts.id, id));
    await tx
      .update(staffBranchAssignments)
      .set({ isPrimary: false })
      .where(eq(staffBranchAssignments.staffId, id));
    await tx
      .insert(staffBranchAssignments)
      .values({ staffId: id, branchId: targetBranchId, isPrimary: true })
      .onDuplicateKeyUpdate({ set: { isPrimary: true } });
  });
  await writeAuditLog({ type: "owner", branchId: previousBranchId }, "staff.branch.transferred", "staff", id, {
    name: staff.name,
    previousBranchId,
    targetBranchId,
    sessionVersion,
  });
  return { staff: await getStaffById(id), previousBranchId, targetBranchId, sessionVersion };
}

export async function resetStaffPassword(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const staff = await getStaffRecordById(id);
  if (!staff) return undefined;
  const temporaryPassword = generateTemporaryPassword();
  const password = await hashOwnerPassword(temporaryPassword);
  await db
    .update(staffAccounts)
    .set({
      passwordHash: password.hash,
      passwordSalt: password.salt,
      sessionVersion: staff.sessionVersion + 1,
    })
    .where(eq(staffAccounts.id, id));
  await writeAuditLog({ type: "owner", branchId: staff.branchId }, "staff.password.reset", "staff", id);
  return { staff: await getStaffById(id), temporaryPassword };
}

export async function setStaffPassword(id: number, newPassword: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const staff = await getStaffRecordById(id);
  if (!staff) return undefined;
  const password = await hashOwnerPassword(newPassword);
  await db
    .update(staffAccounts)
    .set({
      passwordHash: password.hash,
      passwordSalt: password.salt,
      sessionVersion: staff.sessionVersion + 1,
    })
    .where(eq(staffAccounts.id, id));
  await writeAuditLog({ type: "owner", branchId: staff.branchId }, "staff.password.changed_by_owner", "staff", id);
  return { staff: await getStaffById(id) };
}

export async function deleteStaffAccount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const staff = await getStaffRecordById(id);
  if (!staff || staff.roleKey === "deleted") return undefined;
  const deletedUsername = `deleted_${id}_${Date.now()}`.slice(0, 120);
  const sessionVersion = staff.sessionVersion + 1;
  await db
    .update(staffAccounts)
    .set({
      username: deletedUsername,
      roleKey: "deleted",
      permissions: "[]",
      isActive: false,
      sessionVersion,
    })
    .where(eq(staffAccounts.id, id));
  await writeAuditLog({ type: "owner", branchId: staff.branchId }, "staff.deleted", "staff", id, {
    name: staff.name,
    previousUsername: staff.username,
    sessionVersion,
  });
  return { id, branchId: staff.branchId, name: staff.name, sessionVersion };
}

export async function staffHasPermission(staffId: number, permission: StaffPermission) {
  const staff = await getStaffById(staffId);
  return Boolean(staff?.isActive && staff.permissionsList.includes(permission));
}
