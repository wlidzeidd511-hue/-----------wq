CREATE TABLE `owner_passkeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`credentialIdHash` varchar(64) NOT NULL,
	`credentialId` text NOT NULL,
	`publicKey` text NOT NULL,
	`webauthnUserId` varchar(255) NOT NULL,
	`counter` bigint NOT NULL DEFAULT 0,
	`deviceType` varchar(32) NOT NULL,
	`backedUp` boolean NOT NULL DEFAULT false,
	`transports` text,
	`displayName` varchar(160) NOT NULL DEFAULT 'جهاز المالك',
	`createdAt` bigint NOT NULL,
	`lastUsedAt` bigint,
	`revokedAt` bigint,
	CONSTRAINT `owner_passkeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `owner_passkey_credential_hash_uq` UNIQUE(`credentialIdHash`)
);
--> statement-breakpoint
CREATE TABLE `owner_security_settings` (
	`id` int NOT NULL DEFAULT 1,
	`enrollmentTokenHash` varchar(64),
	`enrollmentExpiresAt` bigint,
	`sessionVersion` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `owner_security_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `owner_passkey_active_idx` ON `owner_passkeys` (`revokedAt`,`createdAt`);