CREATE TABLE `inbox_normalizations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`inbox_item_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`failure_reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inbox_normalizations_user_item_version` ON `inbox_normalizations` (`user_id`,`inbox_item_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_inbox_normalizations_user_item` ON `inbox_normalizations` (`user_id`,`inbox_item_id`);--> statement-breakpoint
ALTER TABLE `normalized_messages` ADD `normalization_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `normalized_messages` ADD `normalization_version` integer DEFAULT 1 NOT NULL;