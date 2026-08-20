ALTER TABLE `direct_messages` ADD `orderId` int;--> statement-breakpoint
CREATE INDEX `direct_message_order_idx` ON `direct_messages` (`orderId`);