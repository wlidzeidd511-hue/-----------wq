ALTER TABLE `branch_settings` ADD `adminPasswordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `branch_settings` ADD `adminPasswordSalt` varchar(255);--> statement-breakpoint
ALTER TABLE `branch_settings` ADD `sessionVersion` int DEFAULT 1 NOT NULL;