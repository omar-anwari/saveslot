import Database from "better-sqlite3";
import {
    drizzle,
    type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../../db/schema.ts";
import { PLATFORM_REGISTRY } from "../../lib/platforms/registry.ts";
import { platforms } from "../../db/schema.ts";

export type TestDatabase = BetterSQLite3Database<typeof schema>;

export interface TestDatabaseHandle {
    db: TestDatabase;
    close: () => void;
}

export function createTestDatabase(): TestDatabaseHandle {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "db/migrations" });
    return { db, close: () => sqlite.close() };
}

export function seedTestPlatforms(db: TestDatabase): void {
  for (const definition of PLATFORM_REGISTRY) {
    db.insert(platforms)
      .values({
        slug: definition.slug,
        name: definition.name,
        manufacturer: definition.manufacturer,
        generation: definition.generation,
        emulatorCore: definition.emulatorCore,
        extensionsJson: definition.extensions,
        folderAliasesJson: definition.folderAliases,
        requiresBios: definition.requiresBios,
        experimental: definition.experimental,
        enabled: definition.enabled,
      })
      .run();
  }
}