CREATE TABLE `user_role_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`role` text NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_role_relations_scope` ON `user_role_relations` (`user_id`,`event_id`,`role`,`context`);--> statement-breakpoint
CREATE INDEX `idx_user_role_relations_user_event` ON `user_role_relations` (`user_id`,`event_id`);