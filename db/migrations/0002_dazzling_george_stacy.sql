CREATE TABLE `scan_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_run_id` text NOT NULL,
	`level` text NOT NULL,
	`event_type` text NOT NULL,
	`message` text NOT NULL,
	`context_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`scan_run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scan_events_run_idx` ON `scan_events` (`scan_run_id`);--> statement-breakpoint
CREATE INDEX `scan_events_level_idx` ON `scan_events` (`level`);--> statement-breakpoint
CREATE TABLE `scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`platform_slug` text,
	`discovered_count` integer DEFAULT 0 NOT NULL,
	`added_count` integer DEFAULT 0 NOT NULL,
	`updated_count` integer DEFAULT 0 NOT NULL,
	`missing_count` integer DEFAULT 0 NOT NULL,
	`matched_count` integer DEFAULT 0 NOT NULL,
	`unmatched_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`error_summary` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scan_runs_status_idx` ON `scan_runs` (`status`);--> statement-breakpoint
CREATE INDEX `scan_runs_created_idx` ON `scan_runs` (`created_at`);--> statement-breakpoint
ALTER TABLE `game_files` ADD `last_seen_scan_id` text REFERENCES scan_runs(id);