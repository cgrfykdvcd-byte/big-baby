CREATE TABLE `external_integration_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`user_id` text NOT NULL,
	`secret_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	`last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_external_integration_credentials_provider_secret` ON `external_integration_credentials` (`provider`,`secret_hash`);--> statement-breakpoint
CREATE INDEX `idx_external_integration_credentials_user` ON `external_integration_credentials` (`user_id`,`provider`,`status`);--> statement-breakpoint
CREATE TABLE `external_integration_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`external_request_id` text NOT NULL,
	`inbox_item_id` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_external_integration_receipts_credential_request` ON `external_integration_receipts` (`credential_id`,`external_request_id`);--> statement-breakpoint
CREATE INDEX `idx_external_integration_receipts_credential_status` ON `external_integration_receipts` (`credential_id`,`status`);