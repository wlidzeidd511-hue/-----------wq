ALTER TABLE `internal_alerts` ADD `deleted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `internal_alerts` ADD `deletedAt` bigint;--> statement-breakpoint
ALTER TABLE `internal_alerts` ADD `deletedByName` varchar(255);--> statement-breakpoint
CREATE INDEX `internal_alert_deleted_idx` ON `internal_alerts` (`deleted`,`deletedAt`);