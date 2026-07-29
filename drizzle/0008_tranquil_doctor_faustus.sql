CREATE TABLE `company_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`organization_code` text DEFAULT 'USA' NOT NULL,
	`legal_name` text DEFAULT 'NORWEST PRODUCE LLC' NOT NULL,
	`street` text DEFAULT '710 LAUREL AVENUE' NOT NULL,
	`city` text DEFAULT 'MCALLEN' NOT NULL,
	`state` text DEFAULT 'TX' NOT NULL,
	`postal_code` text DEFAULT '78501' NOT NULL,
	`blue_book_number` text DEFAULT '' NOT NULL,
	`paca_number` text DEFAULT '' NOT NULL,
	`duns_number` text DEFAULT '' NOT NULL,
	`tax_id` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_code` text DEFAULT 'USA' NOT NULL,
	`full_name` text NOT NULL,
	`alias` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`profit_percentage` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `users_org_alias_idx` ON `user_accounts` (`organization_code`,`alias`);--> statement-breakpoint
CREATE INDEX `users_org_email_idx` ON `user_accounts` (`organization_code`,`email`);--> statement-breakpoint
ALTER TABLE `business_partners` ADD `assigned_seller` text;--> statement-breakpoint
ALTER TABLE `sales` ADD `seller_name` text;