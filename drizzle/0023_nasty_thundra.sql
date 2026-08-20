CREATE TABLE `order_status_popup_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`status` varchar(40) NOT NULL,
	`seenAt` bigint NOT NULL,
	CONSTRAINT `order_status_popup_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_status_popup_order_status_uq` UNIQUE(`orderId`,`status`)
);
--> statement-breakpoint
CREATE INDEX `order_status_popup_order_idx` ON `order_status_popup_receipts` (`orderId`);