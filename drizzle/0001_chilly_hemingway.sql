CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_accounts_username` ON `accounts` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_accounts_user` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `analysis_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`engine` text NOT NULL,
	`count` integer NOT NULL,
	`warnings` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_analysis_user_created` ON `analysis_runs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `entry_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_versions_user_entry` ON `entry_versions` (`user_id`,`entry_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'stored' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_files_user_created` ON `files` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inbound_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_receipts_source_external` ON `inbound_receipts` (`source_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `inbound_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`secret_hash` text NOT NULL,
	`last_received` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sources_user` ON `inbound_sources` (`user_id`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`user_id` text PRIMARY KEY NOT NULL,
	`base_url` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`vision_model` text DEFAULT '' NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedule_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_schedule_completions_user_event_day` ON `schedule_completions` (`user_id`,`event_id`,`date`);--> statement-breakpoint
CREATE TABLE `schedule_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`repeat_until` text DEFAULT '' NOT NULL,
	`weekdays` text DEFAULT '[]' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'event' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`file_id` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_user_date` ON `schedule_events` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
ALTER TABLE `entries` ADD `summary` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `action_items` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `keywords` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `message_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `extraction` text DEFAULT 'rules' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `confidence` text DEFAULT '需核对' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `file_id` text DEFAULT '' NOT NULL;