ALTER TABLE `presence_sessions` ADD `orderId` int;--> statement-breakpoint
CREATE INDEX `presence_order_idx` ON `presence_sessions` (`orderId`);