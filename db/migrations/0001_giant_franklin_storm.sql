CREATE TABLE `game_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`relative_path` text NOT NULL,
	`file_name` text NOT NULL,
	`extension` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`modified_at_fs` integer NOT NULL,
	`crc32` text,
	`md5` text,
	`sha1` text,
	`disc_number` integer,
	`file_role` text DEFAULT 'primary' NOT NULL,
	`present` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_files_relative_path_unique` ON `game_files` (`relative_path`);--> statement-breakpoint
CREATE INDEX `game_files_game_idx` ON `game_files` (`game_id`);--> statement-breakpoint
CREATE INDEX `game_files_present_idx` ON `game_files` (`present`);--> statement-breakpoint
CREATE INDEX `game_files_crc32_idx` ON `game_files` (`crc32`);--> statement-breakpoint
CREATE INDEX `game_files_md5_idx` ON `game_files` (`md5`);--> statement-breakpoint
CREATE INDEX `game_files_sha1_idx` ON `game_files` (`sha1`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform_id` integer NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`original_title` text,
	`filename_title` text NOT NULL,
	`summary` text,
	`release_date` text,
	`release_year` integer,
	`developer` text,
	`publisher` text,
	`genres_json` text DEFAULT '[]' NOT NULL,
	`players` integer,
	`rating` real,
	`region` text,
	`revision` text,
	`language` text,
	`metadata_status` text DEFAULT 'unmatched' NOT NULL,
	`metadata_provider` text,
	`metadata_provider_id` text,
	`metadata_confidence` real,
	`manual_fields_json` text DEFAULT '{}' NOT NULL,
	`favourite` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`play_status` text DEFAULT 'unplayed' NOT NULL,
	`last_played_at` integer,
	`total_play_seconds` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_slug_unique` ON `games` (`slug`);--> statement-breakpoint
CREATE INDEX `games_platform_idx` ON `games` (`platform_id`);--> statement-breakpoint
CREATE INDEX `games_sort_title_idx` ON `games` (`sort_title`);--> statement-breakpoint
CREATE INDEX `games_release_year_idx` ON `games` (`release_year`);--> statement-breakpoint
CREATE INDEX `games_favourite_idx` ON `games` (`favourite`);--> statement-breakpoint
CREATE INDEX `games_hidden_idx` ON `games` (`hidden`);--> statement-breakpoint
CREATE INDEX `games_last_played_idx` ON `games` (`last_played_at`);