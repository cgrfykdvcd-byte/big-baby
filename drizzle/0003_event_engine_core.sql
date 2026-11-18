CREATE TABLE `event_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`action_type` text NOT NULL,
	`title` text NOT NULL,
	`actor_role` text NOT NULL,
	`actor_label` text DEFAULT '' NOT NULL,
	`applies_to_user` integer,
	`target_role` text DEFAULT 'unknown' NOT NULL,
	`target_label` text DEFAULT '' NOT NULL,
	`deadline` text,
	`deadline_precision` text DEFAULT 'unknown' NOT NULL,
	`location` text,
	`materials` text DEFAULT '[]' NOT NULL,
	`submission_method` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`source_message_ids` text DEFAULT '[]' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`confidence_details` text DEFAULT '{}' NOT NULL,
	`requires_confirmation` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_event_actions_user_event` ON `event_actions` (`user_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_event_actions_user_status` ON `event_actions` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `event_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`action_id` text,
	`field` text NOT NULL,
	`old_value` text NOT NULL,
	`new_value` text NOT NULL,
	`source_message_ids` text DEFAULT '[]' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`resolution` text NOT NULL,
	`from_version` integer NOT NULL,
	`to_version` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_event_changes_user_event` ON `event_changes` (`user_id`,`event_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_event_changes_user_resolution` ON `event_changes` (`user_id`,`resolution`);--> statement-breakpoint
CREATE TABLE `event_sources` (
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`message_id` text NOT NULL,
	`relation` text DEFAULT 'supporting' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_sources_user_event_message` ON `event_sources` (`user_id`,`event_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `idx_event_sources_user_message` ON `event_sources` (`user_id`,`message_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`participants` text DEFAULT '[]' NOT NULL,
	`information` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`decision` text DEFAULT 'NEEDS_REVIEW' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`confidence_details` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_user_updated` ON `events` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_events_user_status` ON `events` (`user_id`,`status`);--> statement-breakpoint
PRAGMA optimize;
