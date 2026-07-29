CREATE TABLE `inventory_lots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_code` text DEFAULT 'USA' NOT NULL,
	`received_date` text NOT NULL,
	`supplier` text,
	`warehouse` text NOT NULL,
	`pickup_number` text,
	`product` text NOT NULL,
	`presentation` text,
	`size` text,
	`label` text,
	`total_boxes` integer NOT NULL,
	`available_boxes` integer NOT NULL,
	`unit_cost` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_org_product_idx` ON `inventory_lots` (`organization_code`,`product`);--> statement-breakpoint
CREATE INDEX `inventory_org_available_idx` ON `inventory_lots` (`organization_code`,`available_boxes`);--> statement-breakpoint
ALTER TABLE `sales` ADD `supplier` text;--> statement-breakpoint
ALTER TABLE `sales` ADD `inventory_lot_id` integer REFERENCES inventory_lots(id);--> statement-breakpoint
ALTER TABLE `sales` ADD `presentation` text;