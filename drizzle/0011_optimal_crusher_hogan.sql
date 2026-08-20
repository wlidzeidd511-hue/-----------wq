CREATE TABLE `additional_repair_proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`branchId` int NOT NULL,
	`customerId` int,
	`issue` varchar(255) NOT NULL,
	`description` text,
	`amount` int NOT NULL DEFAULT 0,
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`createdByType` enum('owner','staff') NOT NULL DEFAULT 'owner',
	`createdById` int,
	`respondedAt` bigint,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `additional_repair_proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `repair_proposal_order_idx` ON `additional_repair_proposals` (`orderId`);--> statement-breakpoint
CREATE INDEX `repair_proposal_branch_idx` ON `additional_repair_proposals` (`branchId`);--> statement-breakpoint
CREATE INDEX `repair_proposal_customer_idx` ON `additional_repair_proposals` (`customerId`);