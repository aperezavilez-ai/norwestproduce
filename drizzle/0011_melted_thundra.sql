ALTER TABLE `sales` ADD `original_invoice_items` text;--> statement-breakpoint
ALTER TABLE `sales` ADD `invoice_adjustments` text DEFAULT '[]' NOT NULL;