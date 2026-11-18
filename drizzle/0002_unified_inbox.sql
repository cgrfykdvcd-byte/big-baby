ALTER TABLE `entries` ADD `inbox_item_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `inbox_items` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `source_type` text NOT NULL,
  `source_reference` text DEFAULT '' NOT NULL,
  `original_text` text DEFAULT '' NOT NULL,
  `original_language` text DEFAULT 'unknown' NOT NULL,
  `processing_status` text NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `failure_reason` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_items_user_created` ON `inbox_items` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_inbox_items_user_status` ON `inbox_items` (`user_id`,`processing_status`);
--> statement-breakpoint
CREATE TABLE `normalized_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `inbox_item_id` text NOT NULL,
  `source_type` text NOT NULL,
  `source_id` text NOT NULL,
  `text` text NOT NULL,
  `language` text NOT NULL,
  `timestamp` text DEFAULT '' NOT NULL,
  `sender` text DEFAULT '' NOT NULL,
  `attachments` text DEFAULT '[]' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `confidence` text DEFAULT 'medium' NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_normalized_messages_user_inbox` ON `normalized_messages` (`user_id`,`inbox_item_id`);
