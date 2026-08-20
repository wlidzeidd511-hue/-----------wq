import { eq, sql } from "drizzle-orm";
import { shopSettings } from "../drizzle/schema";
import { hashOwnerPassword, verifyOwnerPassword } from "./adminAuth";
import { getDb } from "./db";
import { WHATSAPP_DISPLAY_PHONE } from "../shared/siteConfig";

const DEFAULT_OWNER_PASSWORD = "12345";

export type ShopSettingsUpdate = Partial<
  Pick<
    typeof shopSettings.$inferInsert,
    | "shopName"
    | "subtitle"
    | "phone"
    | "whatsappPhone"
    | "address"
    | "mapUrl"
    | "openingHours"
    | "warrantyPolicy"
    | "currency"
    | "loyaltyRegularOrderThreshold"
    | "loyaltyDistinguishedSpendThreshold"
    | "loyaltyVipSpendThreshold"
  >
>;

export async function getShopSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(shopSettings).where(eq(shopSettings.id, 1)).limit(1);
  if (rows[0]) {
    if (!rows[0].whatsappPhone) {
      await db
        .update(shopSettings)
        .set({ whatsappPhone: WHATSAPP_DISPLAY_PHONE })
        .where(eq(shopSettings.id, 1));
      return { ...rows[0], whatsappPhone: WHATSAPP_DISPLAY_PHONE };
    }
    return rows[0];
  }

  await db.insert(shopSettings).values({ id: 1, whatsappPhone: WHATSAPP_DISPLAY_PHONE });
  const created = await db.select().from(shopSettings).where(eq(shopSettings.id, 1)).limit(1);
  if (!created[0]) throw new Error("Unable to initialize shop settings");
  return created[0];
}

export async function ensureOwnerPassword() {
  const settings = await getShopSettings();
  if (settings.adminPasswordHash && settings.adminPasswordSalt) return settings;

  const { hash, salt } = await hashOwnerPassword(DEFAULT_OWNER_PASSWORD);
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(shopSettings)
    .set({ adminPasswordHash: hash, adminPasswordSalt: salt })
    .where(eq(shopSettings.id, 1));

  return getShopSettings();
}

export async function authenticateOwner(password: string) {
  const settings = await ensureOwnerPassword();
  if (!settings.adminPasswordHash || !settings.adminPasswordSalt) return null;

  const valid = await verifyOwnerPassword(
    password,
    settings.adminPasswordHash,
    settings.adminPasswordSalt,
  );

  return valid ? settings : null;
}

export async function changeOwnerPassword(currentPassword: string, newPassword: string) {
  const settings = await authenticateOwner(currentPassword);
  if (!settings) return null;

  const { hash, salt } = await hashOwnerPassword(newPassword);
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(shopSettings)
    .set({
      adminPasswordHash: hash,
      adminPasswordSalt: salt,
      sessionVersion: sql`${shopSettings.sessionVersion} + 1`,
    })
    .where(eq(shopSettings.id, 1));

  return getShopSettings();
}

export async function updateShopSettings(updates: ShopSettingsUpdate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(shopSettings).set(updates).where(eq(shopSettings.id, 1));
  return getShopSettings();
}

export function toPublicShopSettings(settings: Awaited<ReturnType<typeof getShopSettings>>) {
  const {
    adminPasswordHash: _adminPasswordHash,
    adminPasswordSalt: _adminPasswordSalt,
    sessionVersion: _sessionVersion,
    ...publicSettings
  } = settings;
  return publicSettings;
}
