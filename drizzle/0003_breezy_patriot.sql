CREATE TABLE `notification_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`channel` enum('whatsapp') NOT NULL DEFAULT 'whatsapp',
	`eventType` varchar(80) NOT NULL,
	`recipient` varchar(30) NOT NULL,
	`message` text NOT NULL,
	`status` enum('pending','sent','failed','requires_setup') NOT NULL DEFAULT 'pending',
	`providerMessageId` varchar(255),
	`failureReason` text,
	`createdAt` bigint NOT NULL,
	`sentAt` bigint,
	CONSTRAINT `notification_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`url` text NOT NULL,
	`caption` varchar(255),
	`visibleToCustomer` boolean NOT NULL DEFAULT false,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `order_photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`fromStatus` varchar(40),
	`toStatus` varchar(40) NOT NULL,
	`note` text,
	`visibleToCustomer` boolean NOT NULL DEFAULT true,
	`changedBy` varchar(120) NOT NULL DEFAULT 'المالك',
	`createdAt` bigint NOT NULL,
	CONSTRAINT `order_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shop_settings` (
	`id` int NOT NULL DEFAULT 1,
	`shopName` varchar(255) NOT NULL DEFAULT 'هاتف التميز',
	`subtitle` varchar(255) NOT NULL DEFAULT 'للاتصالات',
	`phone` varchar(30),
	`whatsappPhone` varchar(30),
	`address` text,
	`mapUrl` text,
	`openingHours` text,
	`warrantyPolicy` text,
	`currency` varchar(10) NOT NULL DEFAULT 'ر.س',
	`adminPasswordHash` varchar(255),
	`adminPasswordSalt` varchar(255),
	`sessionVersion` int NOT NULL DEFAULT 1,
	`whatsappEnabled` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shop_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `service_orders` MODIFY COLUMN `status` enum('pending','diagnosing','awaiting_approval','in_progress','ready','delivered','cancelled') NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `service_orders` MODIFY COLUMN `customerPhone` varchar(30);
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `publicToken` varchar(64);
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `deviceBrand` varchar(100);
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `deviceModel` varchar(100);
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `serialNumber` varchar(160);
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `receivedAccessories` text;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `intakeCondition` text;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `amountPaid` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `paymentStatus` enum('unpaid','partial','paid') DEFAULT 'unpaid' NOT NULL;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `priceApprovalStatus` enum('not_required','pending','approved','rejected') DEFAULT 'not_required' NOT NULL;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `approvalRequestedAt` bigint;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `approvalRespondedAt` bigint;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `estimatedCompletionAt` bigint;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `customerVisibleNotes` text;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `internalNotes` text;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `warrantyDays` int DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `warrantyExpiresAt` bigint;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `archived` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `archivedAt` bigint;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD `deliveredAt` bigint;
--> statement-breakpoint
UPDATE `service_orders`
SET `publicToken` = LOWER(REPLACE(UUID(), '-', ''))
WHERE `publicToken` IS NULL OR `publicToken` = '';
--> statement-breakpoint
UPDATE `service_orders`
SET `customerVisibleNotes` = `notes`
WHERE `customerVisibleNotes` IS NULL AND `notes` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `service_orders` MODIFY COLUMN `publicToken` varchar(64) NOT NULL;
--> statement-breakpoint
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_publicToken_unique` UNIQUE(`publicToken`);
--> statement-breakpoint
INSERT INTO `order_status_history` (`orderId`, `fromStatus`, `toStatus`, `note`, `visibleToCustomer`, `changedBy`, `createdAt`)
SELECT `id`, NULL, `status`, 'تم ترحيل الطلب إلى النظام المطور', true, 'النظام', UNIX_TIMESTAMP(`createdAt`) * 1000
FROM `service_orders`;
--> statement-breakpoint
INSERT INTO `shop_settings` (`id`, `shopName`, `subtitle`, `currency`, `warrantyPolicy`, `openingHours`)
VALUES (1, 'هاتف التميز', 'للاتصالات', 'ر.س', 'يشمل الضمان الخدمة المنفذة وقطع الغيار بحسب ما هو موضح في الفاتورة، ولا يشمل الكسر أو السوائل أو سوء الاستخدام.', 'يرجى التواصل مع المحل لمعرفة أوقات العمل.')
ON DUPLICATE KEY UPDATE `shopName` = VALUES(`shopName`);
