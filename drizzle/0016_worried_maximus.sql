CREATE TABLE `content_edit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contentId` int NOT NULL,
	`contentKey` varchar(120) NOT NULL,
	`oldValue` text,
	`newValue` text NOT NULL,
	`editedByType` enum('owner','staff') NOT NULL DEFAULT 'owner',
	`editedById` int,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `content_edit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `site_content` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contentKey` varchar(120) NOT NULL,
	`contentType` enum('text','textarea','number','url','phone') NOT NULL DEFAULT 'text',
	`label` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`defaultValue` text,
	`description` text,
	`isGlobal` boolean NOT NULL DEFAULT true,
	`branchId` int,
	`category` varchar(80) NOT NULL DEFAULT 'general',
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_content_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_content_contentKey_unique` UNIQUE(`contentKey`)
);
--> statement-breakpoint
CREATE INDEX `content_edit_log_content_idx` ON `content_edit_logs` (`contentId`);--> statement-breakpoint
CREATE INDEX `content_edit_log_created_idx` ON `content_edit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `site_content_key_branch_idx` ON `site_content` (`contentKey`,`branchId`);