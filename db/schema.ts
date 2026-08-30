import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export type Platform = typeof platforms.$inferSelect;
export type NewPlatform = typeof platforms.$inferInsert;