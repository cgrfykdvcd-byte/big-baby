CREATE TABLE `calendar_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`action_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_calendar_event_id` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_synced_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_calendar_records_user_action_provider` ON `calendar_records` (`user_id`,`action_id`,`provider`);--> statement-breakpoint
CREATE INDEX `idx_calendar_records_user_status` ON `calendar_records` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`web_enabled` integer DEFAULT 1 NOT NULL,
	`wecom_enabled` integer DEFAULT 0 NOT NULL,
	`push_enabled` integer DEFAULT 0 NOT NULL,
	`sms_enabled` integer DEFAULT 0 NOT NULL,
	`calendar_enabled` integer DEFAULT 1 NOT NULL,
	`critical_sms_enabled` integer DEFAULT 0 NOT NULL,
	`quiet_hours_start` text DEFAULT '' NOT NULL,
	`quiet_hours_end` text DEFAULT '' NOT NULL,
	`deadline_1d_enabled` integer DEFAULT 1 NOT NULL,
	`deadline_2h_enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`action_id` text NOT NULL,
	`channel` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`scheduled_at` text NOT NULL,
	`sent_at` text,
	`template_key` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`dedup_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notifications_user_dedup` ON `notifications` (`user_id`,`dedup_key`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_schedule` ON `notifications` (`user_id`,`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_action` ON `notifications` (`user_id`,`action_id`);