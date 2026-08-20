import {
  bigint,
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Branch = typeof branches.$inferSelect;
export type InsertBranch = typeof branches.$inferInsert;

export const branchSettings = mysqlTable("branch_settings", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull().unique(),
  displayName: varchar("displayName", { length: 255 }),
  phone: varchar("phone", { length: 30 }),
  whatsappPhone: varchar("whatsappPhone", { length: 30 }),
  address: text("address"),
  mapUrl: text("mapUrl"),
  mapsReviewUrl: text("mapsReviewUrl"),
  openingHours: text("openingHours"),
  warrantyPolicy: text("warrantyPolicy"),
  currency: varchar("currency", { length: 10 }).notNull().default("ر.س"),
  invoicePrefix: varchar("invoicePrefix", { length: 20 }),
  waitingScreenEnabled: boolean("waitingScreenEnabled").notNull().default(true),
  whatsappEnabled: boolean("whatsappEnabled").notNull().default(false),
  whatsappPhoneNumberId: varchar("whatsappPhoneNumberId", { length: 120 }),
  adminPasswordHash: varchar("adminPasswordHash", { length: 255 }),
  adminPasswordSalt: varchar("adminPasswordSalt", { length: 255 }),
  sessionVersion: int("sessionVersion").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BranchSettings = typeof branchSettings.$inferSelect;
export type InsertBranchSettings = typeof branchSettings.$inferInsert;

export const staffAccounts = mysqlTable("staff_accounts", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 120 }).notNull().unique(),
  phone: varchar("phone", { length: 30 }),
  jobTitle: varchar("jobTitle", { length: 160 }),
  roleKey: varchar("roleKey", { length: 80 }).notNull().default("employee"),
  permissions: text("permissions").notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  passwordSalt: varchar("passwordSalt", { length: 255 }).notNull(),
  sessionVersion: int("sessionVersion").notNull().default(1),
  isActive: boolean("isActive").notNull().default(true),
  lastLoginAt: bigint("lastLoginAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("staff_branch_idx").on(table.branchId)]);

export type StaffAccount = typeof staffAccounts.$inferSelect;
export type InsertStaffAccount = typeof staffAccounts.$inferInsert;

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  phoneNormalized: varchar("phoneNormalized", { length: 30 }).notNull().unique(),
  phoneDisplay: varchar("phoneDisplay", { length: 30 }).notNull(),
  name: varchar("name", { length: 255 }),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  passwordSalt: varchar("passwordSalt", { length: 255 }).notNull(),
  passwordNeedsReset: boolean("passwordNeedsReset").notNull().default(true),
  sessionVersion: int("sessionVersion").notNull().default(1),
  whatsappOptIn: boolean("whatsappOptIn").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  lastLoginAt: bigint("lastLoginAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

export const serviceOrderStatuses = [
  "pending",
  "diagnosing",
  "awaiting_approval",
  "in_progress",
  "ready",
  "delivered",
  "cancelled",
] as const;

export type ServiceOrderStatus = (typeof serviceOrderStatuses)[number];

export const serviceOrders = mysqlTable("service_orders", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull().default(1),
  customerId: int("customerId"),
  createdByStaffId: int("createdByStaffId"),
  receivedByStaffId: int("receivedByStaffId"),
  lastUpdatedByStaffId: int("lastUpdatedByStaffId"),
  deviceLocationUpdatedByStaffId: int("deviceLocationUpdatedByStaffId"),
  barcode: varchar("barcode", { length: 64 }).notNull().unique(),
  publicToken: varchar("publicToken", { length: 64 }).notNull().unique(),
  serviceType: mysqlEnum("serviceType", ["maintenance", "programming"]).notNull(),
  deviceInfo: text("deviceInfo").notNull(),
  reportedIssue: varchar("reportedIssue", { length: 255 }),
  deviceBrand: varchar("deviceBrand", { length: 100 }),
  deviceModel: varchar("deviceModel", { length: 100 }),
  serialNumber: varchar("serialNumber", { length: 160 }),
  receivedAccessories: text("receivedAccessories"),
  intakeCondition: text("intakeCondition"),
  status: mysqlEnum("status", serviceOrderStatuses).default("pending").notNull(),
  price: int("price").notNull().default(0),
  cost: int("cost").notNull().default(0),
  amountPaid: int("amountPaid").notNull().default(0),
  paymentStatus: mysqlEnum("paymentStatus", ["unpaid", "partial", "paid"])
    .default("unpaid")
    .notNull(),
  priceApprovalStatus: mysqlEnum("priceApprovalStatus", [
    "not_required",
    "pending",
    "approved",
    "rejected",
  ])
    .default("not_required")
    .notNull(),
  approvalRequestedAt: bigint("approvalRequestedAt", { mode: "number" }),
  approvalRespondedAt: bigint("approvalRespondedAt", { mode: "number" }),
  estimatedTime: int("estimatedTime").notNull().default(0),
  estimatedCompletionAt: bigint("estimatedCompletionAt", { mode: "number" }),
  customerName: varchar("customerName", { length: 255 }),
  customerPhone: varchar("customerPhone", { length: 30 }),
  customerVisibleNotes: text("customerVisibleNotes"),
  internalNotes: text("internalNotes"),
  deviceLocation: text("deviceLocation"),
  notes: text("notes"),
  warrantyDays: int("warrantyDays").notNull().default(30),
  warrantyExpiresAt: bigint("warrantyExpiresAt", { mode: "number" }),
  archived: boolean("archived").notNull().default(false),
  archivedAt: bigint("archivedAt", { mode: "number" }),
  deliveredAt: bigint("deliveredAt", { mode: "number" }),
  deliveryPopupSeenAt: bigint("deliveryPopupSeenAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ServiceOrder = typeof serviceOrders.$inferSelect;
export type InsertServiceOrder = typeof serviceOrders.$inferInsert;

export const orderStatusHistory = mysqlTable("order_status_history", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  fromStatus: varchar("fromStatus", { length: 40 }),
  toStatus: varchar("toStatus", { length: 40 }).notNull(),
  note: text("note"),
  visibleToCustomer: boolean("visibleToCustomer").notNull().default(true),
  changedBy: varchar("changedBy", { length: 120 }).notNull().default("المالك"),
  changedByType: mysqlEnum("changedByType", ["owner", "staff", "customer", "system"])
    .notNull()
    .default("owner"),
  changedById: int("changedById"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;
export type InsertOrderStatusHistory = typeof orderStatusHistory.$inferInsert;

export const additionalRepairProposals = mysqlTable("additional_repair_proposals", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  branchId: int("branchId").notNull(),
  customerId: int("customerId"),
  issue: varchar("issue", { length: 255 }).notNull(),
  description: text("description"),
  amount: int("amount").notNull().default(0),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).notNull().default("pending"),
  createdByType: mysqlEnum("createdByType", ["owner", "staff"]).notNull().default("owner"),
  createdById: int("createdById"),
  respondedAt: bigint("respondedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  index("repair_proposal_order_idx").on(table.orderId),
  index("repair_proposal_branch_idx").on(table.branchId),
  index("repair_proposal_customer_idx").on(table.customerId),
]);

export type AdditionalRepairProposal = typeof additionalRepairProposals.$inferSelect;
export type InsertAdditionalRepairProposal = typeof additionalRepairProposals.$inferInsert;

export const orderPhotos = mysqlTable("order_photos", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  url: text("url").notNull(),
  caption: varchar("caption", { length: 255 }),
  visibleToCustomer: boolean("visibleToCustomer").notNull().default(false),
  uploadedByStaffId: int("uploadedByStaffId"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type OrderPhoto = typeof orderPhotos.$inferSelect;
export type InsertOrderPhoto = typeof orderPhotos.$inferInsert;

export const internalAlerts = mysqlTable("internal_alerts", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  alertType: mysqlEnum("alertType", ["part_shortage", "important"]).notNull().default("part_shortage"),
  title: varchar("title", { length: 255 }).notNull(),
  partName: varchar("partName", { length: 255 }),
  quantity: int("quantity"),
  details: text("details"),
  priority: mysqlEnum("priority", ["normal", "important", "urgent"]).notNull().default("important"),
  status: mysqlEnum("status", ["missing", "ordered", "arrived", "resolved"]).notNull().default("missing"),
  createdByType: mysqlEnum("createdByType", ["owner", "staff"]).notNull(),
  createdByStaffId: int("createdByStaffId"),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  updatedByType: mysqlEnum("updatedByType", ["owner", "staff"]).notNull(),
  updatedByStaffId: int("updatedByStaffId"),
  updatedByName: varchar("updatedByName", { length: 255 }).notNull(),
  resolvedAt: bigint("resolvedAt", { mode: "number" }),
  archived: boolean("archived").notNull().default(false),
  archivedAt: bigint("archivedAt", { mode: "number" }),
  deleted: boolean("deleted").notNull().default(false),
  deletedAt: bigint("deletedAt", { mode: "number" }),
  deletedByName: varchar("deletedByName", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  index("internal_alert_branch_status_idx").on(table.branchId, table.archived, table.status),
  index("internal_alert_deleted_idx").on(table.deleted, table.deletedAt),
  index("internal_alert_priority_idx").on(table.priority, table.updatedAt),
]);

export type InternalAlert = typeof internalAlerts.$inferSelect;
export type InsertInternalAlert = typeof internalAlerts.$inferInsert;

export const notificationMessages = mysqlTable("notification_messages", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  branchId: int("branchId"),
  customerId: int("customerId"),
  channel: mysqlEnum("channel", ["whatsapp"]).default("whatsapp").notNull(),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  templateKey: varchar("templateKey", { length: 120 }),
  recipient: varchar("recipient", { length: 30 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed", "requires_setup"])
    .default("pending")
    .notNull(),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  failureReason: text("failureReason"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  sentAt: bigint("sentAt", { mode: "number" }),
});

export type NotificationMessage = typeof notificationMessages.$inferSelect;
export type InsertNotificationMessage = typeof notificationMessages.$inferInsert;

export const shopSettings = mysqlTable("shop_settings", {
  id: int("id").primaryKey().default(1),
  shopName: varchar("shopName", { length: 255 }).notNull().default("هاتف التميز"),
  subtitle: varchar("subtitle", { length: 255 }).notNull().default("للاتصالات"),
  phone: varchar("phone", { length: 30 }),
  whatsappPhone: varchar("whatsappPhone", { length: 30 }),
  address: text("address"),
  mapUrl: text("mapUrl"),
  openingHours: text("openingHours"),
  warrantyPolicy: text("warrantyPolicy"),
  currency: varchar("currency", { length: 10 }).notNull().default("ر.س"),
  adminPasswordHash: varchar("adminPasswordHash", { length: 255 }),
  adminPasswordSalt: varchar("adminPasswordSalt", { length: 255 }),
  sessionVersion: int("sessionVersion").notNull().default(1),
  whatsappEnabled: boolean("whatsappEnabled").notNull().default(false),
  loyaltyRegularOrderThreshold: int("loyaltyRegularOrderThreshold").notNull().default(3),
  loyaltyDistinguishedSpendThreshold: int("loyaltyDistinguishedSpendThreshold").notNull().default(150000),
  loyaltyVipSpendThreshold: int("loyaltyVipSpendThreshold").notNull().default(500000),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ShopSettings = typeof shopSettings.$inferSelect;
export type InsertShopSettings = typeof shopSettings.$inferInsert;

export const ownerSecuritySettings = mysqlTable("owner_security_settings", {
  id: int("id").primaryKey().default(1),
  enrollmentTokenHash: varchar("enrollmentTokenHash", { length: 64 }),
  enrollmentExpiresAt: bigint("enrollmentExpiresAt", { mode: "number" }),
  sessionVersion: int("sessionVersion").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OwnerSecuritySettings = typeof ownerSecuritySettings.$inferSelect;
export type InsertOwnerSecuritySettings = typeof ownerSecuritySettings.$inferInsert;

export const ownerPasskeys = mysqlTable("owner_passkeys", {
  id: int("id").autoincrement().primaryKey(),
  credentialIdHash: varchar("credentialIdHash", { length: 64 }).notNull(),
  credentialId: text("credentialId").notNull(),
  publicKey: text("publicKey").notNull(),
  webauthnUserId: varchar("webauthnUserId", { length: 255 }).notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  deviceType: varchar("deviceType", { length: 32 }).notNull(),
  backedUp: boolean("backedUp").notNull().default(false),
  transports: text("transports"),
  displayName: varchar("displayName", { length: 160 }).notNull().default("جهاز المالك"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  lastUsedAt: bigint("lastUsedAt", { mode: "number" }),
  revokedAt: bigint("revokedAt", { mode: "number" }),
}, table => [
  uniqueIndex("owner_passkey_credential_hash_uq").on(table.credentialIdHash),
  index("owner_passkey_active_idx").on(table.revokedAt, table.createdAt),
]);

export type OwnerPasskey = typeof ownerPasskeys.$inferSelect;
export type InsertOwnerPasskey = typeof ownerPasskeys.$inferInsert;

export const smsMessages = mysqlTable("sms_messages", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
  failureReason: text("failureReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  sentAt: timestamp("sentAt"),
});

export type SmsMessage = typeof smsMessages.$inferSelect;
export type InsertSmsMessage = typeof smsMessages.$inferInsert;

export const staffBranchAssignments = mysqlTable("staff_branch_assignments", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staffId").notNull(),
  branchId: int("branchId").notNull(),
  isPrimary: boolean("isPrimary").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("staff_branch_assignment_uq").on(table.staffId, table.branchId)]);

export const popupMessageCategories = [
  "in_repair",
  "ready",
  "before_rating",
  "after_delivery",
  "before_scratch",
  "scratch_win",
  "scratch_loss",
] as const;

export type PopupMessageCategory = (typeof popupMessageCategories)[number];

export const popupMessages = mysqlTable("popup_messages", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId"),
  category: mysqlEnum("category", popupMessageCategories).notNull(),
  message: text("message").notNull(),
  weight: int("weight").notNull().default(1),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("popup_branch_category_idx").on(table.branchId, table.category)]);

export type PopupMessage = typeof popupMessages.$inferSelect;
export type InsertPopupMessage = typeof popupMessages.$inferInsert;

export const popupCategorySettings = mysqlTable("popup_category_settings", {
  id: int("id").autoincrement().primaryKey(),
  scopeKey: varchar("scopeKey", { length: 120 }).notNull(),
  branchId: int("branchId"),
  category: mysqlEnum("category", popupMessageCategories).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("popup_category_scope_uq").on(table.scopeKey),
  index("popup_category_branch_idx").on(table.branchId, table.category),
]);

export const whatsappTemplates = mysqlTable("whatsapp_templates", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId"),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  templateName: varchar("templateName", { length: 512 }),
  languageCode: varchar("languageCode", { length: 20 }).notNull().default("ar"),
  bodyPreview: text("bodyPreview").notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("wa_template_branch_event_uq").on(table.branchId, table.eventType)]);

export const directMessages = mysqlTable("direct_messages", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId"),
  customerId: int("customerId"),
  orderId: int("orderId"),
  targetSessionKey: varchar("targetSessionKey", { length: 80 }),
  audience: mysqlEnum("audience", ["customer", "visitor", "branch_online", "all_online"]).notNull(),
  title: varchar("title", { length: 255 }),
  body: text("body").notNull(),
  createdByType: mysqlEnum("createdByType", ["owner", "staff"]).notNull().default("owner"),
  createdById: int("createdById"),
  expiresAt: bigint("expiresAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [index("direct_message_target_session_idx").on(table.targetSessionKey), index("direct_message_order_idx").on(table.orderId)]);

export const directMessageReceipts = mysqlTable("direct_message_receipts", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  recipientKey: varchar("recipientKey", { length: 120 }).notNull(),
  seenAt: bigint("seenAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("direct_message_receipt_message_recipient_uq").on(table.messageId, table.recipientKey),
  index("direct_message_receipt_recipient_idx").on(table.recipientKey),
]);

export const orderStatusPopupReceipts = mysqlTable("order_status_popup_receipts", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  status: varchar("status", { length: 40 }).notNull(),
  seenAt: bigint("seenAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("order_status_popup_order_status_uq").on(table.orderId, table.status),
  index("order_status_popup_order_idx").on(table.orderId),
]);

export const webPushSubscriptions = mysqlTable("web_push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  bindingKey: varchar("bindingKey", { length: 180 }).notNull().unique(),
  endpointHash: varchar("endpointHash", { length: 64 }).notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: varchar("p256dh", { length: 255 }).notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  branchId: int("branchId").notNull(),
  customerId: int("customerId"),
  orderId: int("orderId"),
  source: mysqlEnum("source", ["customer_account", "order_tracking"]).notNull(),
  expirationTime: bigint("expirationTime", { mode: "number" }),
  isActive: boolean("isActive").notNull().default(true),
  failureCount: int("failureCount").notNull().default(0),
  lastSuccessAt: bigint("lastSuccessAt", { mode: "number" }),
  lastFailureAt: bigint("lastFailureAt", { mode: "number" }),
  failureReason: text("failureReason"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  index("web_push_endpoint_idx").on(table.endpointHash, table.isActive),
  index("web_push_customer_idx").on(table.customerId, table.isActive),
  index("web_push_order_idx").on(table.orderId, table.isActive),
  index("web_push_branch_idx").on(table.branchId, table.isActive),
]);

export type WebPushSubscription = typeof webPushSubscriptions.$inferSelect;
export type InsertWebPushSubscription = typeof webPushSubscriptions.$inferInsert;

export const webPushDeliveries = mysqlTable("web_push_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  subscriptionId: int("subscriptionId").notNull(),
  orderId: int("orderId").notNull(),
  branchId: int("branchId").notNull(),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["sent", "failed", "skipped"]).notNull(),
  responseStatus: int("responseStatus"),
  failureReason: text("failureReason"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  sentAt: bigint("sentAt", { mode: "number" }),
}, table => [
  index("web_push_delivery_order_idx").on(table.orderId, table.eventType, table.createdAt),
  index("web_push_delivery_subscription_idx").on(table.subscriptionId, table.createdAt),
]);

export type WebPushDelivery = typeof webPushDeliveries.$inferSelect;
export type InsertWebPushDelivery = typeof webPushDeliveries.$inferInsert;

export const presenceSessions = mysqlTable("presence_sessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionKey: varchar("sessionKey", { length: 80 }).notNull().unique(),
  branchId: int("branchId"),
  customerId: int("customerId"),
  orderId: int("orderId"),
  currentPath: varchar("currentPath", { length: 500 }).notNull(),
  displayLabel: varchar("displayLabel", { length: 255 }),
  userAgentHash: varchar("userAgentHash", { length: 80 }),
  lastSeenAt: bigint("lastSeenAt", { mode: "number" }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [index("presence_last_seen_idx").on(table.lastSeenAt), index("presence_branch_idx").on(table.branchId), index("presence_order_idx").on(table.orderId)]);

export const scratchCampaigns = mysqlTable("scratch_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  monthKey: varchar("monthKey", { length: 7 }).notNull(),
  codeCount: int("codeCount").notNull().default(100),
  status: mysqlEnum("status", ["draft", "active", "closed"]).notNull().default("active"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [uniqueIndex("scratch_campaign_branch_month_uq").on(table.branchId, table.monthKey)]);

export const scratchPrizes = mysqlTable("scratch_prizes", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  quantity: int("quantity").notNull().default(0),
  isWinning: boolean("isWinning").notNull().default(true),
  isActive: boolean("isActive").notNull().default(true),
});

export const scratchCodes = mysqlTable("scratch_codes", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  slotNumber: int("slotNumber"),
  branchId: int("branchId").notNull(),
  prizeId: int("prizeId"),
  customerId: int("customerId"),
  orderId: int("orderId"),
  publicCode: varchar("publicCode", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["available", "assigned", "redeemed", "expired"]).notNull().default("available"),
  assignedAt: bigint("assignedAt", { mode: "number" }),
  expiresAt: bigint("expiresAt", { mode: "number" }),
  redeemedAt: bigint("redeemedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [index("scratch_code_campaign_status_idx").on(table.campaignId, table.status), uniqueIndex("scratch_code_campaign_slot_uq").on(table.campaignId, table.slotNumber)]);

export const serviceRatings = mysqlTable("service_ratings", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  orderId: int("orderId").notNull().unique(),
  customerId: int("customerId"),
  stars: int("stars").notNull(),
  feedback: text("feedback"),
  contactBranchId: int("contactBranchId"),
  contactRequestedAt: bigint("contactRequestedAt", { mode: "number" }),
  googleRedirectShown: boolean("googleRedirectShown").notNull().default(false),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId"),
  actorType: mysqlEnum("actorType", ["owner", "staff", "customer", "system"]).notNull(),
  actorId: int("actorId"),
  action: varchar("action", { length: 160 }).notNull(),
  entityType: varchar("entityType", { length: 100 }).notNull(),
  entityId: varchar("entityId", { length: 100 }),
  metadata: text("metadata"),
  integrityHash: varchar("integrityHash", { length: 64 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [index("audit_branch_created_idx").on(table.branchId, table.createdAt)]);

export const branchContent = mysqlTable("branch_content", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  contentType: mysqlEnum("contentType", ["service", "offer", "welcome", "waiting_screen"]).notNull(),
  title: varchar("title", { length: 255 }),
  body: text("body").notNull(),
  mediaUrl: text("mediaUrl"),
  isActive: boolean("isActive").notNull().default(true),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const backupSnapshots = mysqlTable("backup_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  backupKey: varchar("backupKey", { length: 120 }).unique(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  triggerType: mysqlEnum("triggerType", ["manual", "scheduled"]).notNull().default("manual"),
  encryptionVersion: varchar("encryptionVersion", { length: 40 }).notNull().default("aes-256-gcm-v1"),
  status: mysqlEnum("status", ["pending", "completed", "failed"]).notNull().default("pending"),
  rowCount: int("rowCount").notNull().default(0),
  checksum: varchar("checksum", { length: 128 }),
  failureReason: text("failureReason"),
  verifiedAt: bigint("verifiedAt", { mode: "number" }),
  expiresAt: bigint("expiresAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [index("backup_created_idx").on(table.createdAt), index("backup_expiry_idx").on(table.expiresAt)]);

export const authLoginAttempts = mysqlTable("auth_login_attempts", {
  id: int("id").autoincrement().primaryKey(),
  scope: mysqlEnum("scope", ["owner", "staff", "customer"]).notNull(),
  keyType: mysqlEnum("keyType", ["identity", "network"]).notNull(),
  keyHash: varchar("keyHash", { length: 64 }).notNull(),
  failedCount: int("failedCount").notNull().default(0),
  windowStartedAt: bigint("windowStartedAt", { mode: "number" }).notNull(),
  blockedUntil: bigint("blockedUntil", { mode: "number" }),
  lastAttemptAt: bigint("lastAttemptAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("auth_attempt_scope_type_key_uq").on(table.scope, table.keyType, table.keyHash),
  index("auth_attempt_block_idx").on(table.blockedUntil),
]);

export const siteContent = mysqlTable("site_content", {
  id: int("id").autoincrement().primaryKey(),
  contentKey: varchar("contentKey", { length: 120 }).notNull().unique(),
  contentType: mysqlEnum("contentType", ["text", "textarea", "number", "url", "phone"]).notNull().default("text"),
  label: varchar("label", { length: 255 }).notNull(),
  value: text("value").notNull(),
  defaultValue: text("defaultValue"),
  description: text("description"),
  isGlobal: boolean("isGlobal").notNull().default(true),
  branchId: int("branchId"),
  category: varchar("category", { length: 80 }).notNull().default("general"),
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("site_content_key_branch_idx").on(table.contentKey, table.branchId)]);

export type SiteContent = typeof siteContent.$inferSelect;
export type InsertSiteContent = typeof siteContent.$inferInsert;

export const contentEditLogs = mysqlTable("content_edit_logs", {
  id: int("id").autoincrement().primaryKey(),
  contentId: int("contentId").notNull(),
  contentKey: varchar("contentKey", { length: 120 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue").notNull(),
  editedByType: mysqlEnum("editedByType", ["owner", "staff"]).notNull().default("owner"),
  editedById: int("editedById"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [index("content_edit_log_content_idx").on(table.contentId), index("content_edit_log_created_idx").on(table.createdAt)]);

export type ContentEditLog = typeof contentEditLogs.$inferSelect;
export type InsertContentEditLog = typeof contentEditLogs.$inferInsert;

export const systemJobs = mysqlTable("system_jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobKey: varchar("jobKey", { length: 100 }).notNull().unique(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  cronExpression: varchar("cronExpression", { length: 100 }),
  isEnabled: boolean("isEnabled").notNull().default(true),
  lastRunAt: bigint("lastRunAt", { mode: "number" }),
  lastStatus: varchar("lastStatus", { length: 40 }),
  lastError: text("lastError"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
