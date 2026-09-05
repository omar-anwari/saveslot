import { and, eq, inArray, ne, or, isNull, sql } from "drizzle-orm";
import { gameFiles, games, platforms } from "../../db/schema.ts";
import { resolveWithinRoot } from "../filesystem/paths.ts";
import { DEFAULT_ALGORITHMS, type HashAlgorithm } from "../hashing/file-hashes.ts";
import { mapWithConcurrency } from "./concurrency.ts";
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
import { ScanInProgressError, acquireScanLock, currentScanRunId, releaseScanLock } from "./scan-lock.ts";
import { walkLibrary, type DiscoveredFile } from "./walk.ts";
import { hashRomFile } from "../hashing/rom-hashes.ts";

const BATCH_SIZE = 200;

export interface RunScanOptions {
    libraryRoot: string;
    mode: ScanMode;
    platformSlug?: string;
    allowFixtures?: boolean;
    hashConcurrency?: number;
    algorithms?: readonly HashAlgorithm[];
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

export interface StartedScan {
    scanRunId: string;
    completion: Promise<RunScanResult>;
}

export function startScan(db: ScanDatabase, options: RunScanOptions): StartedScan {
    const active = currentScanRunId();
    if (active !== null) throw new ScanInProgressError(active);
    const scanRunId = createScanRun(db, {
        mode: options.mode,
        platformSlug: options.platformSlug,
    });
    acquireScanLock(scanRunId);
    const completion = executeScan(db, scanRunId, options).finally(() => {
        releaseScanLock();
    });

    return { scanRunId, completion };
}

export async function runScan(
    db: ScanDatabase,
    options: RunScanOptions,
): Promise<RunScanResult> {
    return startScan(db, options).completion;
}

async function executeScan(
    db: ScanDatabase,
    scanRunId: string,
    options: RunScanOptions,
): Promise<RunScanResult> {
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
        const allowFixtures = options.allowFixtures ?? false;
        const discovered = allowFixtures
            ? walk.files
            : walk.files.filter((file) => !file.isFixture);
        const skippedFixtures = walk.files.length - discovered.length;
        if (skippedFixtures > 0) {
            recordScanEvent(db, scanRunId, {
                level: "info",
                eventType: "fixture.skipped",
                message:
                    `Skipped ${skippedFixtures} generated fixture file(s). ` +
                    "Set ALLOW_FAKE_ROM_FIXTURES=true to index them.",
                context: { count: skippedFixtures },
            });
        }
        counters.discovered = discovered.length;
        for (const batch of chunk(discovered, BATCH_SIZE)) {
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
        if (options.mode === "full" || options.mode === "hashes-only") {
            await hashScannedFiles(db, scanRunId, options, counters);
            updateScanCounters(db, scanRunId, counters);
        }
        counters.unmatched = countUnmatchedGames(db);
        completeScanRun(db, scanRunId, counters);
        return { scanRunId, counters };
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown scan failure.";
        failScanRun(db, scanRunId, message);
        throw error;
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
                isFixture: file.isFixture,
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
            isFixture: file.isFixture,
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
function gameIdsForPlatform(db: ScanDatabase, platformSlug: string): number[] {
    return db
        .select({ id: games.id })
        .from(games)
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .where(eq(platforms.slug, platformSlug))
        .all()
        .map((row) => row.id);
}

async function hashScannedFiles(
    db: ScanDatabase,
    scanRunId: string,
    options: RunScanOptions,
    counters: ScanCounters,
): Promise<void> {
    const algorithms = options.algorithms ?? DEFAULT_ALGORITHMS;
    const concurrency = options.hashConcurrency ?? 2;
    const scopedIds = options.platformSlug
        ? gameIdsForPlatform(db, options.platformSlug)
        : null;
    const rows = db
        .select({
            id: gameFiles.id,
            relativePath: gameFiles.relativePath,
            extension: gameFiles.extension,
            crc32: gameFiles.crc32,
            md5: gameFiles.md5,
            sha1: gameFiles.sha1,
            platformExtensions: platforms.extensionsJson,
        })
        .from(gameFiles)
        .innerJoin(games, eq(gameFiles.gameId, games.id))
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .where(
            scopedIds === null
                ? eq(gameFiles.present, true)
                : and(eq(gameFiles.present, true), inArray(gameFiles.gameId, scopedIds)),
        )
        .all();
    const targets =
        options.mode === "full"
            ? rows
            : rows.filter((row) =>
                algorithms.some((algorithm) => row[algorithm] === null),
            );
    await mapWithConcurrency(targets, concurrency, async (row) => {
        try {
            const absolute = resolveWithinRoot(options.libraryRoot, row.relativePath);
            const result = await hashRomFile(
                absolute,
                row.extension,
                row.platformExtensions,
                algorithms,
            );
            if (result.warning) {
                recordScanEvent(db, scanRunId, {
                    level: "warning",
                    eventType: "archive.not-inspected",
                    message: result.warning,
                    context: { relativePath: row.relativePath },
                });
            }
            const update: Record<string, unknown> = {
                updatedAt: new Date(),
                hashedEntry: result.hashedEntry,
            };
            const hashes = result.hashes;
            if (hashes.crc32 !== null) update.crc32 = hashes.crc32;
            if (hashes.md5 !== null) update.md5 = hashes.md5;
            if (hashes.sha1 !== null) update.sha1 = hashes.sha1;
            db.update(gameFiles).set(update).where(eq(gameFiles.id, row.id)).run();
        } catch (error) {
            counters.errors += 1;
            recordScanEvent(db, scanRunId, {
                level: "warning",
                eventType: "hash.failed",
                message:
                    error instanceof Error ? error.message : "Hashing failed.",
                context: { relativePath: row.relativePath },
            });
        }
    });
}