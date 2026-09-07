import { stat } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { games, metadataCandidates, platforms } from "../../db/schema.ts";
import type { MetadataDatabase } from "../metadata/lookup-cache.ts";
import { ImageDecodeError, deriveCoverImages } from "./derive.ts";
import { ArtworkFetchError, fetchImage, type ResolvedAddress } from "./fetch.ts";
import { resolveArtworkPath, storeDerivatives } from "./storage.ts";
import { UnsafeUrlError } from "./url-guard.ts";

export const DEFAULT_IMAGE_HOSTS: readonly string[] = ["images.igdb.com"];

export type CoverOutcome = "cached" | "reused" | "skipped" | "error";

export interface CacheCoverResult {
    gameId: number;
    outcome: CoverOutcome;
    coverPath: string | null;
    deduped: boolean;
    message: string | null;
}

export interface CacheCoverOptions {
    dataRoot: string;
    allowedHosts?: readonly string[];
    forceRefresh?: boolean;
    signal?: AbortSignal;
    now?: Date;
    maxBytes?: number;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    lookupImpl?: (hostname: string) => Promise<readonly ResolvedAddress[]>;
}

function done(
    gameId: number,
    outcome: CoverOutcome,
    message: string | null = null,
    coverPath: string | null = null,
    deduped = false,
): CacheCoverResult {
    return { gameId, outcome, coverPath, deduped, message };
}

function coverUrlFrom(value: unknown): string | null {
    if (typeof value !== "object" || value === null) return null;
    const url = (value as Record<string, unknown>).coverUrl;
    return typeof url === "string" && url.length > 0 ? url : null;
}

async function fileExists(dataRoot: string, relativePath: string | null): Promise<boolean> {
    if (relativePath === null) return false;
    try {
        await stat(resolveArtworkPath(dataRoot, relativePath));
        return true;
    } catch {
        return false;
    }
}

export async function cacheCoverArt(
    db: MetadataDatabase,
    gameId: number,
    options: CacheCoverOptions,
): Promise<CacheCoverResult> {
    const now = options.now ?? new Date();
    const game = db
        .select({
            id: games.id,
            coverPath: games.coverPath,
            coverThumbPath: games.coverThumbPath,
            coverSourceUrl: games.coverSourceUrl,
        })
        .from(games)
        .where(eq(games.id, gameId))
        .get();
    if (game === undefined) return done(gameId, "skipped", "No such game.");
    const chosen = db
        .select({ metadataJson: metadataCandidates.metadataJson })
        .from(metadataCandidates)
        .where(and(eq(metadataCandidates.gameId, gameId), eq(metadataCandidates.isSelected, true)))
        .get();
    if (chosen === undefined) return done(gameId, "skipped", "No metadata has been applied yet.");
    const sourceUrl = coverUrlFrom(chosen.metadataJson);
    if (sourceUrl === null) return done(gameId, "skipped", "The applied metadata has no cover URL.");
    if (options.forceRefresh !== true && game.coverSourceUrl === sourceUrl) {
        const intact =
            (await fileExists(options.dataRoot, game.coverPath)) &&
            (await fileExists(options.dataRoot, game.coverThumbPath));
        if (intact) return done(gameId, "reused", null, game.coverPath, true);
    }
    try {
        const image = await fetchImage(sourceUrl, {
            allowedHosts: options.allowedHosts ?? DEFAULT_IMAGE_HOSTS,
            signal: options.signal,
            maxBytes: options.maxBytes,
            timeoutMs: options.timeoutMs,
            fetchImpl: options.fetchImpl,
            lookupImpl: options.lookupImpl,
        });
        const derived = await deriveCoverImages(image.bytes);
        const stored = await storeDerivatives(options.dataRoot, derived.derivatives);
        const cover = stored.find((entry) => entry.name === "cover");
        const thumb = stored.find((entry) => entry.name === "thumb");
        if (cover === undefined || thumb === undefined) {
            return done(gameId, "error", "Deriving the cover produced an unexpected set of sizes.");
        }
        db.update(games)
            .set({
                coverPath: cover.relativePath,
                coverThumbPath: thumb.relativePath,
                coverSourceUrl: sourceUrl,
                coverUpdatedAt: now,
                updatedAt: now,
            })
            .where(eq(games.id, gameId))
            .run();
        return done(gameId, "cached", null, cover.relativePath, cover.deduped && thumb.deduped);
    } catch (error) {
        if (
            error instanceof UnsafeUrlError ||
            error instanceof ArtworkFetchError ||
            error instanceof ImageDecodeError
        ) {
            return done(gameId, "error", `${error.name}: ${error.message}`);
        }
        throw error;
    }
}

export const MAX_CONSECUTIVE_ERRORS = 3;

export interface RunArtworkOptions extends CacheCoverOptions {
    platformSlug?: string;
    limit?: number;
    delayMs?: number;
    onProgress?: (result: CacheCoverResult, index: number, total: number) => void;
}

export interface RunArtworkSummary {
    total: number;
    cached: number;
    reused: number;
    skipped: number;
    errors: number;
    abortedReason: string | null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}

export async function runArtworkPass(
    db: MetadataDatabase,
    options: RunArtworkOptions,
): Promise<RunArtworkSummary> {
    const conditions = [eq(metadataCandidates.isSelected, true)];
    if (options.platformSlug !== undefined) {
        conditions.push(eq(platforms.slug, options.platformSlug));
    }
    let query = db
        .selectDistinct({ id: games.id })
        .from(games)
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .innerJoin(metadataCandidates, eq(metadataCandidates.gameId, games.id))
        .where(and(...conditions))
        .orderBy(games.id)
        .$dynamic();
    if (options.limit !== undefined) query = query.limit(options.limit);
    const targets = query.all();
    const summary: RunArtworkSummary = {
        total: targets.length,
        cached: 0, reused: 0, skipped: 0, errors: 0,
        abortedReason: null,
    };
    let consecutiveErrors = 0;
    for (const [index, target] of targets.entries()) {
        if (options.signal?.aborted === true) {
            summary.abortedReason = "Cancelled.";
            break;
        }
        const result = await cacheCoverArt(db, target.id, options);
        switch (result.outcome) {
            case "cached": summary.cached += 1; break;
            case "reused": summary.reused += 1; break;
            case "skipped": summary.skipped += 1; break;
            case "error": summary.errors += 1; break;
        }
        options.onProgress?.(result, index, targets.length);
        if (result.outcome === "error") {
            consecutiveErrors += 1;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                summary.abortedReason = `Artwork failed ${consecutiveErrors} times in a row; stopping.`;
                break;
            }
        } else {
            consecutiveErrors = 0;
        }
        if (result.outcome === "cached") await sleep(options.delayMs ?? 0, options.signal);
    }
    return summary;
}