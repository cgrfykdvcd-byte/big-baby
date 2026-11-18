CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_checkins_user_date` ON `checkins` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`original` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`source_type` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`deadline` text DEFAULT '' NOT NULL,
	`deadline_note` text DEFAULT '' NOT NULL,
	`plan_date` text DEFAULT '' NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`recipient` text DEFAULT '' NOT NULL,
	`method` text DEFAULT '' NOT NULL,
	`attachments` text DEFAULT '' NOT NULL,
	`filename` text DEFAULT '' NOT NULL,
	`reviewed_date` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text DEFAULT '' NOT NULL,
	`sample` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_entries_user_created` ON `entries` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '同学' NOT NULL,
	`viewed_date` text DEFAULT '' NOT NULL
);
