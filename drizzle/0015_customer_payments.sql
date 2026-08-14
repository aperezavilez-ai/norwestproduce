CREATE TABLE IF NOT EXISTS `customer_payments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_code` text DEFAULT 'USA' NOT NULL,
  `sale_id` integer NOT NULL,
  `customer` text NOT NULL,
  `payment_date` text NOT NULL,
  `amount` real NOT NULL,
  `method` text DEFAULT 'OTRO' NOT NULL,
  `reference` text,
  `notes` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customer_payments_org_sale_idx` ON `customer_payments` (`organization_code`,`sale_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customer_payments_org_date_idx` ON `customer_payments` (`organization_code`,`payment_date`);
