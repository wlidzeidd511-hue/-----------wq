CREATE TABLE `sms_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`message` text NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`failureReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	CONSTRAINT `sms_messages_id` PRIMARY KEY(`id`)
);
