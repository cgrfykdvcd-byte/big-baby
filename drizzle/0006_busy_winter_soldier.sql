CREATE TABLE `external_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_user_id` text NOT NULL,
	`internal_user_id` text NOT NULL,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_external_identities_provider_user` ON `external_identities` (`provider`,`external_user_id`);--> statement-breakpoint
CREATE INDEX `idx_external_identities_internal_user` ON `external_identities` (`internal_user_id`);--> statement-breakpoint
CREATE TABLE `wecom_callbacks` (
	`id` text PRIMARY KEY NOT NULL,
	`dedup_key` text NOT NULL,
	`message_id` text DEFAULT '' NOT NULL,
	`external_user_id` text DEFAULT '' NOT NULL,
	`message_type` text DEFAULT '' NOT NULL,
	`encrypted_payload` text NOT NULL,
	`status` text NOT NULL,
	`mapping_status` text DEFAULT 'unknown' NOT NULL,
	`inbox_item_id` text DEFAULT '' NOT NULL,
	`error_code` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wecom_callbacks_dedup` ON `wecom_callbacks` (`dedup_key`);--> statement-breakpoint
CREATE INDEX `idx_wecom_callbacks_external_user` ON `wecom_callbacks` (`external_user_id`);--> statement-breakpoint
CREATE INDEX `idx_wecom_callbacks_status` ON `wecom_callbacks` (`status`);