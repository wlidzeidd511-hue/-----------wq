CREATE TABLE `service_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barcode` varchar(64) NOT NULL,
	`serviceType` enum('maintenance','programming') NOT NULL,
	`deviceInfo` text NOT NULL,
	`status` enum('pending','in_progress','ready') NOT NULL DEFAULT 'pending',
	`price` int NOT NULL DEFAULT 0,
	`cost` int NOT NULL DEFAULT 0,
	`estimatedTime` int NOT NULL DEFAULT 0,
	`customerName` varchar(255),
	`customerPhone` varchar(20),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `service_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_orders_barcode_unique` UNIQUE(`barcode`)
);
