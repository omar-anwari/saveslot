CREATE TABLE `play_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`last_heartbeat_at` integer NOT NULL,
	`ended_at` integer,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`exit_reason` text DEFAULT 'unknown' NOT NULL,
	`core_key` text NOT NULL,
	`client_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `play_sessions_game_idx` ON `play_sessions` (`game_id`);--> statement-breakpoint
CREATE INDEX `play_sessions_ended_idx` ON `play_sessions` (`ended_at`);--> statement-breakpoint
CREATE INDEX `play_sessions_heartbeat_idx` ON `play_sessions` (`last_heartbeat_at`);--> statement-breakpoint
CREATE TABLE `save_states` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` integer NOT NULL,
	`core_key` text NOT NULL,
	`core_version` text,
	`slot` text,
	`label` text,
	`local_relative_path` text NOT NULL,
	`screenshot_relative_path` text,
	`checksum_sha256` text NOT NULL,
	`byte_size` integer NOT NULL,
	`is_autosave` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `save_states_game_idx` ON `save_states` (`game_id`);--> statement-breakpoint
CREATE INDEX `save_states_core_idx` ON `save_states` (`game_id`,`core_key`);--> statement-breakpoint
CREATE INDEX `save_states_autosave_idx` ON `save_states` (`is_autosave`);--> statement-breakpoint
CREATE TABLE `saves` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`core_key` text NOT NULL,
	`slot` text DEFAULT 'main' NOT NULL,
	`kind` text DEFAULT 'sram' NOT NULL,
	`file_extension` text NOT NULL,
	`local_relative_path` text NOT NULL,
	`checksum_sha256` text NOT NULL,
	`byte_size` integer NOT NULL,
	`screenshot_relative_path` text,
	`is_current` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'emulator' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saves_game_idx` ON `saves` (`game_id`);--> statement-breakpoint
CREATE INDEX `saves_checksum_idx` ON `saves` (`checksum_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `saves_one_current_idx` ON `saves` (`game_id`,`core_key`,`slot`) WHERE "saves"."is_current" = 1;