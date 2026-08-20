CREATE TABLE `direct_message_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`recipientKey` varchar(120) NOT NULL,
	`seenAt` bigint NOT NULL,
	CONSTRAINT `direct_message_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `direct_message_receipt_message_recipient_uq` UNIQUE(`messageId`,`recipientKey`)
);
--> statement-breakpoint
CREATE INDEX `direct_message_receipt_recipient_idx` ON `direct_message_receipts` (`recipientKey`);