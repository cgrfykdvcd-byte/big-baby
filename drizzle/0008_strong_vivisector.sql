CREATE TABLE `wecom_binding_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`external_user_id` text DEFAULT '' NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` text,
	`replay_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wecom_binding_challenges_token` ON `wecom_binding_challenges` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_wecom_binding_challenges_user` ON `wecom_binding_challenges` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_wecom_binding_challenges_expiry` ON `wecom_binding_challenges` (`expires_at`);