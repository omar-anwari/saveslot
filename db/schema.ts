import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const platforms = sqliteTable("platforms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  manufacturer: text("manufacturer"),
  generation: integer("generation"),
  emulatorCore: text("emulator_core"),
  extensionsJson: text("extensions_json", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  folderAliasesJson: text("folder_aliases_json", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  requiresBios: integer("requires_bios", { mode: "boolean" })
    .notNull()
    .default(false),
  experimental: integer("experimental", { mode: "boolean" })
    .notNull()
    .default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const METADATA_STATUSES = [
  "unmatched",
  "matched",
  "partial",
  "manual",
  "error",
] as const;

export const PLAY_STATUSES = [
  "unplayed",
  "playing",
  "completed",
  "abandoned",
  "backlog",
] as const;

export const FILE_ROLES = [
  "primary",
  "disc",
  "patch",
  "manual",
  "auxiliary",
] as const;

export const games = sqliteTable(
  "games",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platformId: integer("platform_id")
      .notNull()
      .references(() => platforms.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    sortTitle: text("sort_title").notNull(),
    originalTitle: text("original_title"),
    filenameTitle: text("filename_title").notNull(),
    summary: text("summary"),
    releaseDate: text("release_date"),
    releaseYear: integer("release_year"),
    developer: text("developer"),
    publisher: text("publisher"),
    genresJson: text("genres_json", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    players: integer("players"),
    rating: real("rating"),
    region: text("region"),
    revision: text("revision"),
    language: text("language"),
    metadataStatus: text("metadata_status", { enum: METADATA_STATUSES })
      .notNull()
      .default("unmatched"),
    metadataProvider: text("metadata_provider"),
    metadataProviderId: text("metadata_provider_id"),
    metadataConfidence: real("metadata_confidence"),
    manualFieldsJson: text("manual_fields_json", { mode: "json" })
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    favourite: integer("favourite", { mode: "boolean" })
      .notNull()
      .default(false),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    playStatus: text("play_status", { enum: PLAY_STATUSES })
      .notNull()
      .default("unplayed"),
    lastPlayedAt: integer("last_played_at", { mode: "timestamp" }),
    totalPlaySeconds: integer("total_play_seconds").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("games_platform_idx").on(table.platformId),
    index("games_sort_title_idx").on(table.sortTitle),
    index("games_release_year_idx").on(table.releaseYear),
    index("games_favourite_idx").on(table.favourite),
    index("games_hidden_idx").on(table.hidden),
    index("games_last_played_idx").on(table.lastPlayedAt),
  ],
);

export const gameFiles = sqliteTable(
  "game_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull().unique(),
    fileName: text("file_name").notNull(),
    extension: text("extension").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    modifiedAtFs: integer("modified_at_fs", { mode: "timestamp" }).notNull(),
    crc32: text("crc32"),
    md5: text("md5"),
    sha1: text("sha1"),
    discNumber: integer("disc_number"),
    fileRole: text("file_role", { enum: FILE_ROLES })
      .notNull()
      .default("primary"),
    present: integer("present", { mode: "boolean" }).notNull().default(true),
    lastSeenScanId: text("last_seen_scan_id").references(() => scanRuns.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("game_files_game_idx").on(table.gameId),
    index("game_files_present_idx").on(table.present),
    index("game_files_crc32_idx").on(table.crc32),
    index("game_files_md5_idx").on(table.md5),
    index("game_files_sha1_idx").on(table.sha1),
  ],
);

export const SCAN_MODES = [
  "quick",
  "full",
  "unmatched",
  "metadata-only",
  "hashes-only",
] as const;

export const SCAN_STATUSES = [
  "queued",
  "running",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
] as const;

export const SCAN_EVENT_LEVELS = ["debug", "info", "warning", "error"] as const;

export const scanRuns = sqliteTable(
  "scan_runs",
  {
    id: text("id").primaryKey(),
    mode: text("mode", { enum: SCAN_MODES }).notNull(),
    status: text("status", { enum: SCAN_STATUSES }).notNull().default("queued"),
    platformSlug: text("platform_slug"),
    discoveredCount: integer("discovered_count").notNull().default(0),
    addedCount: integer("added_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    missingCount: integer("missing_count").notNull().default(0),
    matchedCount: integer("matched_count").notNull().default(0),
    unmatchedCount: integer("unmatched_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    errorSummary: text("error_summary"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("scan_runs_status_idx").on(table.status),
    index("scan_runs_created_idx").on(table.createdAt),
  ],
);

export const scanEvents = sqliteTable(
  "scan_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanRunId: text("scan_run_id")
      .notNull()
      .references(() => scanRuns.id, { onDelete: "cascade" }),
    level: text("level", { enum: SCAN_EVENT_LEVELS }).notNull(),
    eventType: text("event_type").notNull(),
    message: text("message").notNull(),
    contextJson: text("context_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("scan_events_run_idx").on(table.scanRunId),
    index("scan_events_level_idx").on(table.level),
  ],
);

export type ScanRun = typeof scanRuns.$inferSelect;
export type NewScanRun = typeof scanRuns.$inferInsert;
export type ScanEvent = typeof scanEvents.$inferSelect;
export type NewScanEvent = typeof scanEvents.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type GameFile = typeof gameFiles.$inferSelect;
export type NewGameFile = typeof gameFiles.$inferInsert;
export type Platform = typeof platforms.$inferSelect;
export type NewPlatform = typeof platforms.$inferInsert;