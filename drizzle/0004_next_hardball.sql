CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_code` text DEFAULT 'USA' NOT NULL,
	`name` text NOT NULL,
	`presentation` text,
	`size` text,
	`label` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_org_name_idx` ON `products` (`organization_code`,`name`);--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `purchase_price` real;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `freight_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `mexico_customs_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `us_customs_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `overweight_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `red_light_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `cold_storage` text;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `cold_storage_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `additional_expenses` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `total_import_cost` real;