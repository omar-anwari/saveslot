import { and, desc, eq } from "drizzle-orm";
import { games, metadataCandidates, platforms } from "../../db/schema.ts";
import { enrichmentCandidate } from "./candidate.ts";
import type { MetadataDatabase } from "./lookup-cache.ts";
import { applyToGame } from "./match-service.ts";
import { MetadataProviderError } from "./provider-error.ts";
import { chooseBest } from "./title-match.ts";
import type { MetadataCandidate, MetadataProvider, NormalizedGameMetadata } from "./types.ts";

export const SEARCH_LIMIT = 10;
export const SEARCH_STORE_LIMIT = 5;

export type EnrichOutcome = "enriched" | "reused" | "skipped" | "not_found" | "error";

export interface EnrichGameResult {
    gameId: number;
    outcome: EnrichOutcome;
    appliedTitle: string | null;
    message: string | null;
    retryAfterMs: number | null;
}

export interface EnrichOptions {
    provider: MetadataProvider;
    externalSource?: string;
    signal?: AbortSignal;
    now?: Date;
    forceRefresh?: boolean;
}

function done(
    gameId: number,
    outcome: EnrichOutcome,
    message: string | null = null,
    appliedTitle: string | null = null,
    retryAfterMs: number | null = null,
): EnrichGameResult {
    return { gameId, outcome, appliedTitle, message, retryAfterMs };
}

function readMetadata(value: unknown): NormalizedGameMetadata | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.title !== "string" || record.title.length === 0) return null;
    if (!Array.isArray(record.platformSlugs)) return null;
    return value as NormalizedGameMetadata;
}

function externalIdFrom(metadata: unknown, source: string): string | null {
    if (typeof metadata !== "object" || metadata === null) return null;
    const list = (metadata as Record<string, unknown>).externalIds;
    if (!Array.isArray(list)) return null;
    for (const entry of list) {
        if (typeof entry !== "object" || entry === null) continue;
        const record = entry as Record<string, unknown>;
        if (record.source !== source) continue;
        if (typeof record.id === "string" && record.id.length > 0) return record.id;
    }
    return null;
}

export async function enrichGame(
    db: MetadataDatabase,
    gameId: number,
    options: EnrichOptions,
): Promise<EnrichGameResult> {
    const now = options.now ?? new Date();
    const source = options.externalSource ?? "IGDB";
    const game = db
        .select({ id: games.id, platformSlug: platforms.slug, releaseYear: games.releaseYear })
        .from(games)
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .where(eq(games.id, gameId))
        .get();
    if (game === undefined) return done(gameId, "skipped", "No such game.");
    const identity = db
        .select()
        .from(metadataCandidates)
        .where(and(eq(metadataCandidates.gameId, gameId), eq(metadataCandidates.matchType, "hash")))
        .orderBy(desc(metadataCandidates.score))
        .get();
    if (identity === undefined) {
        return done(gameId, "skipped", "Not identified yet; run the metadata pass first.");
    }
    if (options.forceRefresh !== true) {
        const already = db
            .select()
            .from(metadataCandidates)
            .where(
                and(
                    eq(metadataCandidates.gameId, gameId),
                    eq(metadataCandidates.providerKey, options.provider.key),
                    eq(metadataCandidates.isSelected, true),
                ),
            )
            .get();
        const stored = already === undefined ? null : readMetadata(already.metadataJson);
        if (stored !== null) return done(gameId, "reused", null, stored.title);
    }
    const externalId = externalIdFrom(identity.metadataJson, source);
    let toStore: MetadataCandidate[] = [];
    let chosen: MetadataCandidate | null = null;
    let rejection: string | null = null;
    try {
        if (externalId !== null) {
            const metadata = await options.provider.getGame(externalId, options.signal);
            if (metadata === null) return done(gameId, "not_found", `${source} has no game ${externalId}.`);
            chosen = enrichmentCandidate({
                providerKey: options.provider.key,
                providerGameId: externalId,
                metadata,
                platformSlug: game.platformSlug,
                inheritedScore: identity.score,
                identityProviderKey: identity.providerKey,
                identityDetail: `Identity from ${identity.providerKey} (${identity.title}), scored ${identity.score.toFixed(2)}.`,
            });
            if (chosen.platformSlug === null) {
                rejection = chosen.reasons.at(-1)?.detail ?? "Platform disagreement.";
                toStore = [chosen];
                chosen = null;
            } else {
                toStore = [chosen];
            }
        } else {
            const results = await options.provider.searchByTitle(
                {
                    title: identity.title,
                    platformSlug: game.platformSlug,
                    releaseYear: game.releaseYear,
                    limit: SEARCH_LIMIT,
                },
                options.signal,
            );
            toStore = results.slice(0, SEARCH_STORE_LIMIT);
            if (toStore.length === 0) {
                return done(gameId, "not_found", `${source} found nothing for "${identity.title}".`);
            }
            const best = chooseBest(toStore.map((item) => ({ item, score: item.score })));
            rejection = best?.rejected ?? "No usable result.";
            if (best !== null && best.rejected === null) {
                chosen = best.item;
                rejection = null;
            }
        }
    } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error.";
        const retryAfterMs = error instanceof MetadataProviderError ? error.retryAfterMs : null;
        return done(gameId, "error", message, null, retryAfterMs);
    }
    let appliedTitle: string | null = null;
    db.transaction((tx) => {
        for (const candidate of toStore) {
            const values = {
                score: candidate.score,
                matchType: candidate.matchType,
                platformSlug: candidate.platformSlug,
                title: candidate.metadata.title,
                metadataJson: { ...candidate.metadata },
                reasonsJson: candidate.reasons.map((reason) => ({ ...reason })),
                updatedAt: now,
            };
            tx.insert(metadataCandidates)
                .values({
                    gameId,
                    providerKey: candidate.providerKey,
                    providerGameId: candidate.providerGameId,
                    isSelected: false,
                    createdAt: now,
                    ...values,
                })
                .onConflictDoUpdate({
                    target: [
                        metadataCandidates.gameId,
                        metadataCandidates.providerKey,
                        metadataCandidates.providerGameId,
                    ],
                    set: values,
                })
                .run();
        }
        if (chosen === null) return;
        tx.update(metadataCandidates)
            .set({ isSelected: false, updatedAt: now })
            .where(eq(metadataCandidates.gameId, gameId))
            .run();
        tx.update(metadataCandidates)
            .set({ isSelected: true, updatedAt: now })
            .where(
                and(
                    eq(metadataCandidates.gameId, gameId),
                    eq(metadataCandidates.providerKey, chosen.providerKey),
                    eq(metadataCandidates.providerGameId, chosen.providerGameId),
                ),
            )
            .run();
        appliedTitle = applyToGame(tx, gameId, chosen, now);
    });
    if (chosen === null) {
        return done(gameId, "skipped", rejection);
    }
    return done(gameId, "enriched", null, appliedTitle);
}