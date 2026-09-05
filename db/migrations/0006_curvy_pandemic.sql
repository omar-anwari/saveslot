CREATE TABLE `metadata_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`provider_key` text NOT NULL,
	`provider_game_id` text NOT NULL,
	`score` real NOT NULL,
	`match_type` text NOT NULL,
	`platform_slug` text,
	`title` text NOT NULL,
	`metadata_json` text NOT NULL,
	`reasons_json` text DEFAULT '[]' NOT NULL,
	`is_selected` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metadata_candidates_unique_idx` ON `metadata_candidates` (`game_id`,`provider_key`,`provider_game_id`);--> statement-breakpoint
CREATE INDEX `metadata_candidates_score_idx` ON `metadata_candidates` (`game_id`,`score`);--> statement-breakpoint
CREATE UNIQUE INDEX `metadata_candidates_one_selected_idx` ON `metadata_candidates` (`game_id`) WHERE "metadata_candidates"."is_selected" = 1;--> statement-breakpoint
CREATE TABLE `metadata_lookups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_key` text NOT NULL,
	`hash_algorithm` text NOT NULL,
	`hash_value` text NOT NULL,
	`status` text NOT NULL,
	`response_json` text,
	`error_message` text,
	`latency_ms` integer,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metadata_lookups_key_idx` ON `metadata_lookups` (`provider_key`,`hash_algorithm`,`hash_value`);--> statement-breakpoint
CREATE INDEX `metadata_lookups_expires_idx` ON `metadata_lookups` (`expires_at`);