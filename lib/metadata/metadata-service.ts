import { and, eq, inArray } from "drizzle-orm";
import { games, metadataCandidates, platforms } from "../../db/schema.ts";
import { enrichGame, type EnrichGameResult } from "./enrich-service.ts";
import type { MetadataDatabase } from "./lookup-cache.ts";
import { identifyGame, type MatchGameResult } from "./match-service.ts";
import type { MetadataProvider } from "./types.ts";

export const MAX_CONSECUTIVE_ERRORS = 3;
export interface RunMetadataOptions {
    provider: MetadataProvider;
    includeMatched?: boolean;
    platformSlug?: string;
    limit?: number;
    forceRefresh?: boolean;
    delayMs?: number;
    signal?: AbortSignal;
    now?: Date;
    onProgress?: (result: MatchGameResult, index: number, total: number) => void;
}
export interface RunMetadataSummary {
    total: number;
    matched: number;
    partial: number;
    notFound: number;
    skipped: number;
    errors: number;
    fromCache: number;
    abortedReason: string | null;
}

const EMPTY: RunMetadataSummary = {
    total: 0, matched: 0, partial: 0, notFound: 0,
    skipped: 0, errors: 0, fromCache: 0, abortedReason: null,
};

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

export async function runMetadataPass(
    db: MetadataDatabase,
    options: RunMetadataOptions,
): Promise<RunMetadataSummary> {
    const conditions = [];
    if (options.includeMatched !== true) {
        conditions.push(inArray(games.metadataStatus, ["unmatched", "error", "partial"]));
    }
    if (options.platformSlug !== undefined) {
        conditions.push(eq(platforms.slug, options.platformSlug));
    }
    let query = db
        .select({ id: games.id })
        .from(games)
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(games.id)
        .$dynamic();
    if (options.limit !== undefined) query = query.limit(options.limit);
    const targets = query.all();
    const summary: RunMetadataSummary = { ...EMPTY, total: targets.length };
    let consecutiveErrors = 0;
    for (const [index, target] of targets.entries()) {
        if (options.signal?.aborted === true) {
            summary.abortedReason = "Cancelled.";
            break;
        }
        const result = await identifyGame(db, target.id, {
            provider: options.provider,
            signal: options.signal,
            now: options.now,
            forceRefresh: options.forceRefresh,
        });
        if (result.fromCache) summary.fromCache += 1;
        switch (result.outcome) {
            case "matched": summary.matched += 1; break;
            case "partial": summary.partial += 1; break;
            case "not_found": summary.notFound += 1; break;
            case "skipped": summary.skipped += 1; break;
            case "error": summary.errors += 1; break;
        }
        options.onProgress?.(result, index, targets.length);
        if (result.retryAfterMs !== null && !result.fromCache) {
            summary.abortedReason =
                `Provider is rate limiting. Retry in about ${Math.ceil(result.retryAfterMs / 1000)}s.`;
            break;
        }
        if (result.outcome === "error" && !result.fromCache) {
            consecutiveErrors += 1;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                summary.abortedReason = `Provider failed ${consecutiveErrors} times in a row; stopping.`;
                break;
            }
        } else {
            consecutiveErrors = 0;
        }
        if (!result.fromCache && result.outcome !== "skipped") {
            await sleep(options.delayMs ?? 0, options.signal);
        }
    }
    return summary;
}

export interface RunEnrichmentOptions {
    provider: MetadataProvider;
    externalSource?: string;
    platformSlug?: string;
    limit?: number;
    forceRefresh?: boolean;
    delayMs?: number;
    signal?: AbortSignal;
    now?: Date;
    onProgress?: (result: EnrichGameResult, index: number, total: number) => void;
}

export interface RunEnrichmentSummary {
    total: number;
    enriched: number;
    reused: number;
    notFound: number;
    skipped: number;
    errors: number;
    abortedReason: string | null;
}

export async function runEnrichmentPass(
    db: MetadataDatabase,
    options: RunEnrichmentOptions,
): Promise<RunEnrichmentSummary> {
    const conditions = [eq(metadataCandidates.matchType, "hash")];
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
    const summary: RunEnrichmentSummary = {
        total: targets.length,
        enriched: 0, reused: 0, notFound: 0, skipped: 0, errors: 0,
        abortedReason: null,
    };
    let consecutiveErrors = 0;
    for (const [index, target] of targets.entries()) {
        if (options.signal?.aborted === true) {
            summary.abortedReason = "Cancelled.";
            break;
        }
        const result = await enrichGame(db, target.id, {
            provider: options.provider,
            externalSource: options.externalSource,
            signal: options.signal,
            now: options.now,
            forceRefresh: options.forceRefresh,
        });
        switch (result.outcome) {
            case "enriched": summary.enriched += 1; break;
            case "reused": summary.reused += 1; break;
            case "not_found": summary.notFound += 1; break;
            case "skipped": summary.skipped += 1; break;
            case "error": summary.errors += 1; break;
        }
        options.onProgress?.(result, index, targets.length);
        if (result.retryAfterMs !== null) {
            summary.abortedReason =
                `Provider is rate limiting. Retry in about ${Math.ceil(result.retryAfterMs / 1000)}s.`;
            break;
        }
        if (result.outcome === "error") {
            consecutiveErrors += 1;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                summary.abortedReason = `Provider failed ${consecutiveErrors} times in a row; stopping.`;
                break;
            }
        } else {
            consecutiveErrors = 0;
        }
        if (result.outcome === "enriched" || result.outcome === "not_found") {
            await sleep(options.delayMs ?? 0, options.signal);
        }
    }
    return summary;
}