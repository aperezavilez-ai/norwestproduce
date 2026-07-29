CREATE TABLE `sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_code` text DEFAULT 'USA' NOT NULL,
	`sale_date` text NOT NULL,
	`customer` text NOT NULL,
	`purchase_order` text,
	`warehouse` text NOT NULL,
	`pickup_number` text NOT NULL,
	`boxes` integer NOT NULL,
	`product` text NOT NULL,
	`size` text,
	`label` text,
	`purchase_price` real,
	`sale_price` real,
	`profit` real,
	`ship_date` text,
	`pickup_date` text,
	`total` real,
	`due_date` text,
	`load_status` text DEFAULT 'OK' NOT NULL,
	`payment_status` text DEFAULT 'PENDIENTE' NOT NULL,
	`invoice_number` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sales_org_date_idx` ON `sales` (`organization_code`,`sale_date`);--> statement-breakpoint
CREATE INDEX `sales_org_pickup_idx` ON `sales` (`organization_code`,`pickup_number`);