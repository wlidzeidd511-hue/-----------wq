CREATE TABLE `internal_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`alertType` enum('part_shortage','important') NOT NULL DEFAULT 'part_shortage',
	`title` varchar(255) NOT NULL,
	`partName` varchar(255),
	`quantity` int,
	`details` text,
	`priority` enum('normal','important','urgent') NOT NULL DEFAULT 'important',
	`status` enum('missing','ordered','arrived','resolved') NOT NULL DEFAULT 'missing',
	`createdByType` enum('owner','staff') NOT NULL,
	`createdByStaffId` int,
	`createdByName` varchar(255) NOT NULL,
	`updatedByType` enum('owner','staff') NOT NULL,
	`updatedByStaffId` int,
	`updatedByName` varchar(255) NOT NULL,
	`resolvedAt` bigint,
	`archived` boolean NOT NULL DEFAULT false,
	`archivedAt` bigint,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `internal_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `internal_alert_branch_status_idx` ON `internal_alerts` (`branchId`,`archived`,`status`);--> statement-breakpoint
CREATE INDEX `internal_alert_priority_idx` ON `internal_alerts` (`priority`,`updatedAt`);