ALTER TABLE `scan_runs` ADD `progress_phase` text;--> statement-breakpoint
ALTER TABLE `scan_runs` ADD `progress_done` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scan_runs` ADD `progress_total` integer DEFAULT 0 NOT NULL;