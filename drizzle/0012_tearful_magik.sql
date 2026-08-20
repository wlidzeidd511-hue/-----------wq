ALTER TABLE `shop_settings` ADD `loyaltyRegularOrderThreshold` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `shop_settings` ADD `loyaltyDistinguishedSpendThreshold` int DEFAULT 150000 NOT NULL;--> statement-breakpoint
ALTER TABLE `shop_settings` ADD `loyaltyVipSpendThreshold` int DEFAULT 500000 NOT NULL;