CREATE TABLE `web_push_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subscriptionId` int NOT NULL,
	`orderId` int NOT NULL,
	`branchId` int NOT NULL,
	`eventType` varchar(80) NOT NULL,
	`title` varchar(255) NOT NULL,
	`status` enum('sent','failed','skipped') NOT NULL,
	`responseStatus` int,
	`failureReason` text,
	`createdAt` bigint NOT NULL,
	`sentAt` bigint,
	CONSTRAINT `web_push_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `web_push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bindingKey` varchar(180) NOT NULL,
	`endpointHash` varchar(64) NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`branchId` int NOT NULL,
	`customerId` int,
	`orderId` int,
	`source` enum('customer_account','order_tracking') NOT NULL,
	`expirationTime` bigint,
	`isActive` boolean NOT NULL DEFAULT true,
	`failureCount` int NOT NULL DEFAULT 0,
	`lastSuccessAt` bigint,
	`lastFailureAt` bigint,
	`failureReason` text,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `web_push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `web_push_subscriptions_bindingKey_unique` UNIQUE(`bindingKey`)
);
--> statement-breakpoint
CREATE INDEX `web_push_delivery_order_idx` ON `web_push_deliveries` (`orderId`,`eventType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `web_push_delivery_subscription_idx` ON `web_push_deliveries` (`subscriptionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `web_push_endpoint_idx` ON `web_push_subscriptions` (`endpointHash`,`isActive`);--> statement-breakpoint
CREATE INDEX `web_push_customer_idx` ON `web_push_subscriptions` (`customerId`,`isActive`);--> statement-breakpoint
CREATE INDEX `web_push_order_idx` ON `web_push_subscriptions` (`orderId`,`isActive`);--> statement-breakpoint
CREATE INDEX `web_push_branch_idx` ON `web_push_subscriptions` (`branchId`,`isActive`);