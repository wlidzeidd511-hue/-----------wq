ALTER TABLE `scratch_codes` ADD `slotNumber` int;--> statement-breakpoint
ALTER TABLE `scratch_codes` ADD CONSTRAINT `scratch_code_campaign_slot_uq` UNIQUE(`campaignId`,`slotNumber`);