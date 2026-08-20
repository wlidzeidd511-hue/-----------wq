ALTER TABLE `direct_messages` MODIFY COLUMN `audience` enum('customer','visitor','branch_online','all_online') NOT NULL;--> statement-breakpoint
ALTER TABLE `direct_messages` ADD `targetSessionKey` varchar(80);--> statement-breakpoint
CREATE INDEX `direct_message_target_session_idx` ON `direct_messages` (`targetSessionKey`);