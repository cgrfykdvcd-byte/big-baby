CREATE TABLE `mcp_oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`redirect_uris` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_oauth_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`resource` text NOT NULL,
	`scope` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_oauth_codes_expiry` ON `mcp_oauth_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `mcp_oauth_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`family_id` text NOT NULL,
	`kind` text NOT NULL,
	`resource` text NOT NULL,
	`scope` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_oauth_tokens_family` ON `mcp_oauth_tokens` (`family_id`);--> statement-breakpoint
CREATE INDEX `idx_mcp_oauth_tokens_credential` ON `mcp_oauth_tokens` (`credential_id`);--> statement-breakpoint
CREATE INDEX `idx_mcp_oauth_tokens_expiry` ON `mcp_oauth_tokens` (`expires_at`);