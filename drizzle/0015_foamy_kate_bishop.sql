CREATE TABLE `popup_category_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scopeKey` varchar(120) NOT NULL,
	`branchId` int,
	`category` enum('in_repair','ready','before_rating','after_delivery','before_scratch','scratch_win','scratch_loss') NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `popup_category_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `popup_category_scope_uq` UNIQUE(`scopeKey`)
);
--> statement-breakpoint
CREATE INDEX `popup_category_branch_idx` ON `popup_category_settings` (`branchId`,`category`);