import { and, eq, inArray, ne, or, isNull, sql } from "drizzle-orm";
import { gameFiles, games, platforms } from "../../db/schema.ts";
import { parseFilename } from "./filename.ts";
import {
    EMPTY_COUNTERS,
    completeScanRun,
    createScanRun,
    failScanRun,
    recordScanEvent,
    startScanRun,
    updateScanCounters,
    type ScanCounters,
    type ScanDatabase,
    type ScanMode,
} from "./scan-run.ts";
import { acquireScanLock, releaseScanLock } from "./scan-lock.ts";
import { walkLibrary, type DiscoveredFile } from "./walk.ts";

const BATCH_SIZE = 200;

export interface RunScanOptions {
    libraryRoot: string;
    mode: ScanMode;
    platformSlug?: string;
}

export interface RunScanResult {
    scanRunId: string;
    counters: ScanCounters;
}

function slugify(value: string): string {
    const slug = value
        .normalize("NFKD")
        .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
    return slug.length > 0 ? slug : "game";
}

function uniqueGameSlug(db: ScanDatabase, base: string): string {
    let candidate = base;
    let suffix = 2;
    while (
        db.select({ id: games.id }).from(games).where(eq(games.slug, candidate)).get()
    ) {
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
    return candidate;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

export async function runScan(
    db: ScanDatabase,
    options: RunScanOptions,
): Promise<RunScanResult> {
    const scanRunId = createScanRun(db, {
        mode: options.mode,
        platformSlug: options.platformSlug,
    });
    acquireScanLock(scanRunId);
    const counters: ScanCounters = { ...EMPTY_COUNTERS };
    try {
        startScanRun(db, scanRunId);
        const platformRows = db
            .select({ id: platforms.id, slug: platforms.slug })
            .from(platforms)
            .all();
        const platformIdBySlug = new Map(platformRows.map((p) => [p.slug, p.id]));
        const walk = await walkLibrary(options.libraryRoot, {
            platformSlug: options.platformSlug,
        });
        for (const warning of walk.warnings) {
            recordScanEvent(db, scanRunId, {
                level: "warning",
                eventType: `walk.${warning.type}`,
                message: warning.message,
                context: { relativePath: warning.relativePath },
            });
        }
        counters.discovered = walk.files.length;
        for (const batch of chunk(walk.files, BATCH_SIZE)) {
            db.transaction((tx) => {
                for (const file of batch) {
                    const platformId = platformIdBySlug.get(file.platformSlug);
                    if (platformId === undefined) {
                        counters.errors += 1;
                        continue;
                    }
                    const outcome = upsertFile(tx as ScanDatabase, {
                        file,
                        platformId,
                        scanRunId,
                    });
                    if (outcome === "added") counters.added += 1;
                    if (outcome === "updated") counters.updated += 1;
                }
            });
            updateScanCounters(db, scanRunId, counters);
        }
        counters.missing = markMissingFiles(db, scanRunId, options.platformSlug);
        counters.unmatched = countUnmatchedGames(db);
        completeScanRun(db, scanRunId, counters);
        return { scanRunId, counters };
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown scan failure.";
        failScanRun(db, scanRunId, message);
        throw error;
    } finally {
        releaseScanLock();
    }
}

interface UpsertInput {
    file: DiscoveredFile;
    platformId: number;
    scanRunId: string;
}

function upsertFile(
    db: ScanDatabase,
    { file, platformId, scanRunId }: UpsertInput,
): "added" | "updated" | "unchanged" {
    const existing = db
        .select()
        .from(gameFiles)
        .where(eq(gameFiles.relativePath, file.relativePath))
        .get();
    if (existing) {
        const changed =
            existing.sizeBytes !== file.sizeBytes ||
            existing.modifiedAtFs.getTime() !== file.modifiedAtFs.getTime() ||
            !existing.present;
        db.update(gameFiles)
            .set({
                sizeBytes: file.sizeBytes,
                modifiedAtFs: file.modifiedAtFs,
                present: true,
                lastSeenScanId: scanRunId,
                ...(changed ? { crc32: null, md5: null, sha1: null } : {}),
                updatedAt: new Date(),
            })
            .where(eq(gameFiles.id, existing.id))
            .run();
        return changed ? "updated" : "unchanged";
    }

    const parsed = parseFilename(file.fileName);
    const slug = uniqueGameSlug(db, `${file.platformSlug}-${slugify(parsed.title)}`);
    const inserted = db
        .insert(games)
        .values({
            platformId,
            slug,
            title: parsed.title,
            sortTitle: parsed.sortTitle,
            filenameTitle: parsed.title,
            releaseYear: parsed.year,
            region: parsed.region,
            revision: parsed.revision,
            language: parsed.languages.join(",") || null,
            metadataStatus: "unmatched",
        })
        .returning({ id: games.id })
        .get();
    db.insert(gameFiles)
        .values({
            gameId: inserted.id,
            relativePath: file.relativePath,
            fileName: file.fileName,
            extension: file.extension,
            sizeBytes: file.sizeBytes,
            modifiedAtFs: file.modifiedAtFs,
            discNumber: parsed.discNumber,
            fileRole: "primary",
            present: true,
            lastSeenScanId: scanRunId,
        })
        .run();
    return "added";
}

function markMissingFiles(
    db: ScanDatabase,
    scanRunId: string,
    platformSlug?: string,
): number {
    const scopedGameIds = platformSlug
        ? db
            .select({ id: games.id })
            .from(games)
            .innerJoin(platforms, eq(games.platformId, platforms.id))
            .where(eq(platforms.slug, platformSlug))
            .all()
            .map((row) => row.id)
        : null;
    const notSeen = or(
        isNull(gameFiles.lastSeenScanId),
        ne(gameFiles.lastSeenScanId, scanRunId),
    );
    const condition =
        scopedGameIds === null
            ? and(eq(gameFiles.present, true), notSeen)
            : and(
                eq(gameFiles.present, true),
                notSeen,
                inArray(gameFiles.gameId, scopedGameIds),
            );
    const result = db
        .update(gameFiles)
        .set({ present: false, updatedAt: new Date() })
        .where(condition)
        .run();
    return result.changes;
}
function countUnmatchedGames(db: ScanDatabase): number {
    const row = db
        .select({ value: sql<number>`count(*)` })
        .from(games)
        .where(eq(games.metadataStatus, "unmatched"))
        .get();
    return row?.value ?? 0;
}