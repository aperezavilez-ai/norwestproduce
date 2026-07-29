CREATE TABLE `business_partners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_code` text DEFAULT 'USA' NOT NULL,
	`partner_type` text NOT NULL,
	`name` text NOT NULL,
	`tax_id` text NOT NULL,
	`blue_book_number` text NOT NULL,
	`duns_number` text NOT NULL,
	`street` text NOT NULL,
	`exterior_number` text NOT NULL,
	`interior_number` text,
	`state_code` text NOT NULL,
	`state_name` text NOT NULL,
	`city` text NOT NULL,
	`postal_code` text NOT NULL,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`contact_phone` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `partners_org_type_name_idx` ON `business_partners` (`organization_code`,`partner_type`,`name`);--> statement-breakpoint
CREATE INDEX `partners_org_tax_id_idx` ON `business_partners` (`organization_code`,`tax_id`);