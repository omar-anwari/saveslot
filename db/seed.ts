import { eq } from "drizzle-orm";
import { PLATFORM_REGISTRY } from "../lib/platforms/registry.ts";
import { db, sqlite } from "./client.ts";
import { platforms } from "./schema.ts";
import { pathToFileURL } from "node:url";

export function seedPlatforms(): { inserted: number; updated: number } {
    const now = new Date();
    let inserted = 0;
    let updated = 0;

    db.transaction((tx) => {
        for (const definition of PLATFORM_REGISTRY) {
            const registryFields = {
                name: definition.name,
                manufacturer: definition.manufacturer,
                generation: definition.generation,
                emulatorCore: definition.emulatorCore,
                extensionsJson: definition.extensions,
                folderAliasesJson: definition.folderAliases,
                requiresBios: definition.requiresBios,
                experimental: definition.experimental,
                updatedAt: now,
            };

            const existing = tx
                .select({ id: platforms.id })
                .from(platforms)
                .where(eq(platforms.slug, definition.slug))
                .get();

            if (existing) {
                tx.update(platforms)
                    .set(registryFields)
                    .where(eq(platforms.slug, definition.slug))
                    .run();
                updated += 1;
            } else {
                tx.insert(platforms)
                    .values({
                        slug: definition.slug,
                        ...registryFields,
                        enabled: definition.enabled,
                        createdAt: now,
                    })
                    .run();
                inserted += 1;
            }
        }
    });

    return { inserted, updated };
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    const result = seedPlatforms();
    console.log(
        `Platform seed complete: ${result.inserted} inserted, ${result.updated} updated.`,
    );
    sqlite.close();
}