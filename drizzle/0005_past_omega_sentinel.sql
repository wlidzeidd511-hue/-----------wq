CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int,
	`actorType` enum('owner','staff','customer','system') NOT NULL,
	`actorId` int,
	`action` varchar(160) NOT NULL,
	`entityType` varchar(100) NOT NULL,
	`entityId` varchar(100),
	`metadata` text,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `backup_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`rowCount` int NOT NULL DEFAULT 0,
	`checksum` varchar(128),
	`failureReason` text,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `backup_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branch_content` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`contentType` enum('service','offer','welcome','waiting_screen') NOT NULL,
	`title` varchar(255),
	`body` text NOT NULL,
	`mediaUrl` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branch_content_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branch_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`displayName` varchar(255),
	`phone` varchar(30),
	`whatsappPhone` varchar(30),
	`address` text,
	`mapUrl` text,
	`mapsReviewUrl` text,
	`openingHours` text,
	`warrantyPolicy` text,
	`currency` varchar(10) NOT NULL DEFAULT 'ر.س',
	`invoicePrefix` varchar(20),
	`waitingScreenEnabled` boolean NOT NULL DEFAULT true,
	`whatsappEnabled` boolean NOT NULL DEFAULT false,
	`whatsappPhoneNumberId` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branch_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `branch_settings_branchId_unique` UNIQUE(`branchId`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(80) NOT NULL,
	`code` varchar(20) NOT NULL,
	`name` varchar(160) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `branches_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phoneNormalized` varchar(30) NOT NULL,
	`phoneDisplay` varchar(30) NOT NULL,
	`name` varchar(255),
	`passwordHash` varchar(255) NOT NULL,
	`passwordSalt` varchar(255) NOT NULL,
	`passwordNeedsReset` boolean NOT NULL DEFAULT true,
	`sessionVersion` int NOT NULL DEFAULT 1,
	`whatsappOptIn` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastLoginAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_phoneNormalized_unique` UNIQUE(`phoneNormalized`)
);
--> statement-breakpoint
CREATE TABLE `direct_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int,
	`customerId` int,
	`audience` enum('customer','branch_online','all_online') NOT NULL,
	`title` varchar(255),
	`body` text NOT NULL,
	`createdByType` enum('owner','staff') NOT NULL DEFAULT 'owner',
	`createdById` int,
	`expiresAt` bigint,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `direct_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `popup_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int,
	`category` enum('in_repair','ready','before_rating','after_delivery','before_scratch','scratch_win','scratch_loss') NOT NULL,
	`message` text NOT NULL,
	`weight` int NOT NULL DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `popup_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `presence_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionKey` varchar(80) NOT NULL,
	`branchId` int,
	`customerId` int,
	`currentPath` varchar(500) NOT NULL,
	`displayLabel` varchar(255),
	`userAgentHash` varchar(80),
	`lastSeenAt` bigint NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `presence_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `presence_sessions_sessionKey_unique` UNIQUE(`sessionKey`)
);
--> statement-breakpoint
CREATE TABLE `scratch_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`codeCount` int NOT NULL DEFAULT 100,
	`status` enum('draft','active','closed') NOT NULL DEFAULT 'active',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `scratch_campaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `scratch_campaign_branch_month_uq` UNIQUE(`branchId`,`monthKey`)
);
--> statement-breakpoint
CREATE TABLE `scratch_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`branchId` int NOT NULL,
	`prizeId` int,
	`customerId` int,
	`orderId` int,
	`publicCode` varchar(64) NOT NULL,
	`status` enum('available','assigned','redeemed','expired') NOT NULL DEFAULT 'available',
	`assignedAt` bigint,
	`expiresAt` bigint,
	`redeemedAt` bigint,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `scratch_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `scratch_codes_publicCode_unique` UNIQUE(`publicCode`)
);
--> statement-breakpoint
CREATE TABLE `scratch_prizes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`quantity` int NOT NULL DEFAULT 0,
	`isWinning` boolean NOT NULL DEFAULT true,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `scratch_prizes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `service_ratings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`orderId` int NOT NULL,
	`customerId` int,
	`stars` int NOT NULL,
	`feedback` text,
	`googleRedirectShown` boolean NOT NULL DEFAULT false,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `service_ratings_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_ratings_orderId_unique` UNIQUE(`orderId`)
);
--> statement-breakpoint
CREATE TABLE `staff_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`username` varchar(120) NOT NULL,
	`phone` varchar(30),
	`jobTitle` varchar(160),
	`roleKey` varchar(80) NOT NULL DEFAULT 'employee',
	`permissions` text NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`passwordSalt` varchar(255) NOT NULL,
	`sessionVersion` int NOT NULL DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastLoginAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_accounts_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `staff_branch_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffId` int NOT NULL,
	`branchId` int NOT NULL,
	`isPrimary` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_branch_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_branch_assignment_uq` UNIQUE(`staffId`,`branchId`)
);
--> statement-breakpoint
CREATE TABLE `system_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobKey` varchar(100) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`cronExpression` varchar(100),
	`isEnabled` boolean NOT NULL DEFAULT true,
	`lastRunAt` bigint,
	`lastStatus` varchar(40),
	`lastError` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_jobs_jobKey_unique` UNIQUE(`jobKey`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int,
	`eventType` varchar(100) NOT NULL,
	`templateName` varchar(512),
	`languageCode` varchar(20) NOT NULL DEFAULT 'ar',
	`bodyPreview` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `wa_template_branch_event_uq` UNIQUE(`branchId`,`eventType`)
);
--> statement-breakpoint
ALTER TABLE `notification_messages` ADD `branchId` int;--> statement-breakpoint
ALTER TABLE `notification_messages` ADD `customerId` int;--> statement-breakpoint
ALTER TABLE `notification_messages` ADD `templateKey` varchar(120);--> statement-breakpoint
ALTER TABLE `order_photos` ADD `uploadedByStaffId` int;--> statement-breakpoint
ALTER TABLE `order_status_history` ADD `changedByType` enum('owner','staff','customer','system') DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_status_history` ADD `changedById` int;--> statement-breakpoint
ALTER TABLE `service_orders` ADD `branchId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `service_orders` ADD `customerId` int;--> statement-breakpoint
ALTER TABLE `service_orders` ADD `createdByStaffId` int;--> statement-breakpoint
ALTER TABLE `service_orders` ADD `receivedByStaffId` int;--> statement-breakpoint
ALTER TABLE `service_orders` ADD `lastUpdatedByStaffId` int;--> statement-breakpoint
ALTER TABLE `service_orders` ADD `deviceLocationUpdatedByStaffId` int;--> statement-breakpoint
CREATE INDEX `audit_branch_created_idx` ON `audit_logs` (`branchId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `popup_branch_category_idx` ON `popup_messages` (`branchId`,`category`);--> statement-breakpoint
CREATE INDEX `presence_last_seen_idx` ON `presence_sessions` (`lastSeenAt`);--> statement-breakpoint
CREATE INDEX `presence_branch_idx` ON `presence_sessions` (`branchId`);--> statement-breakpoint
CREATE INDEX `scratch_code_campaign_status_idx` ON `scratch_codes` (`campaignId`,`status`);--> statement-breakpoint
CREATE INDEX `staff_branch_idx` ON `staff_accounts` (`branchId`);