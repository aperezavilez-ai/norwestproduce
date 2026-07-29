CREATE TABLE `cold_storages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_code` text DEFAULT 'USA' NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`phone` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cold_storage_org_name_idx` ON `cold_storages` (`organization_code`,`name`);--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `boxes_per_pallet` integer;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `pallets_per_load` integer;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `cost_currencies` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `exchange_rate` real;