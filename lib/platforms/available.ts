import { and, asc, eq, sql } from "drizzle-orm";
import { games, platforms } from "../../db/schema.ts";
import { coreNames, isEmulatorJsInstalled } from "../emulatorjs/manifest.ts";
import type { ScanDatabase } from "../scanning/scan-run.ts";

export interface AvailablePlatform {
    slug: string;
    name: string;
    manufacturer: string | null;
    generation: number | null;
    emulatorCore: string | null;
    extensionsJson: string[];
    folderAliasesJson: string[];
    enabled: boolean;
    experimental: boolean;
    requiresBios: boolean;
    gameCount: number;
    coreInstalled: boolean;
}

export function availablePlatforms(db: ScanDatabase): AvailablePlatform[] {
    const rows = db
        .select({
            slug: platforms.slug,
            name: platforms.name,
            manufacturer: platforms.manufacturer,
            generation: platforms.generation,
            emulatorCore: platforms.emulatorCore,
            extensionsJson: platforms.extensionsJson,
            folderAliasesJson: platforms.folderAliasesJson,
            enabled: platforms.enabled,
            experimental: platforms.experimental,
            requiresBios: platforms.requiresBios,
            gameCount: sql<number>`count(${games.id})`,
        })
        .from(platforms)
        .leftJoin(games, and(eq(games.platformId, platforms.id), eq(games.hidden, false)))
        .groupBy(platforms.id)
        .orderBy(asc(platforms.name))
        .all();
    const installed = isEmulatorJsInstalled() ? coreNames() : null;
    return rows.map((row) => ({
        ...row,
        coreInstalled:
            row.emulatorCore !== null && (installed === null || installed.has(row.emulatorCore)),
    }));
}