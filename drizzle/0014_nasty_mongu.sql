CREATE TABLE `auth_login_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` enum('owner','staff','customer') NOT NULL,
	`keyType` enum('identity','network') NOT NULL,
	`keyHash` varchar(64) NOT NULL,
	`failedCount` int NOT NULL DEFAULT 0,
	`windowStartedAt` bigint NOT NULL,
	`blockedUntil` bigint,
	`lastAttemptAt` bigint NOT NULL,
	CONSTRAINT `auth_login_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_attempt_scope_type_key_uq` UNIQUE(`scope`,`keyType`,`keyHash`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `integrityHash` varchar(64);--> statement-breakpoint
ALTER TABLE `backup_snapshots` ADD `backupKey` varchar(120);--> statement-breakpoint
ALTER TABLE `backup_snapshots` ADD `triggerType` enum('manual','scheduled') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `backup_snapshots` ADD `encryptionVersion` varchar(40) DEFAULT 'aes-256-gcm-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `backup_snapshots` ADD `verifiedAt` bigint;--> statement-breakpoint
ALTER TABLE `backup_snapshots` ADD `expiresAt` bigint;--> statement-breakpoint
ALTER TABLE `backup_snapshots` ADD CONSTRAINT `backup_snapshots_backupKey_unique` UNIQUE(`backupKey`);--> statement-breakpoint
CREATE INDEX `auth_attempt_block_idx` ON `auth_login_attempts` (`blockedUntil`);--> statement-breakpoint
CREATE INDEX `backup_created_idx` ON `backup_snapshots` (`createdAt`);--> statement-breakpoint
CREATE INDEX `backup_expiry_idx` ON `backup_snapshots` (`expiresAt`);