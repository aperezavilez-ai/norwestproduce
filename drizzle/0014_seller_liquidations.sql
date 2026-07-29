CREATE TABLE IF NOT EXISTS `seller_liquidations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_code` text DEFAULT 'USA' NOT NULL,
  `seller_name` text NOT NULL,
  `liquidation_date` text NOT NULL,
  `amount` real NOT NULL,
  `notes` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `seller_liquidations_org_seller_idx` ON `seller_liquidations` (`organization_code`,`seller_name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `seller_liquidations_org_date_idx` ON `seller_liquidations` (`organization_code`,`liquidation_date`);
