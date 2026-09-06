import { and, desc, eq } from "drizzle-orm";
import { games, metadataCandidates, platforms } from "../../db/schema.ts";
import { enrichmentCandidate } from "./candidate.ts";
import type { MetadataDatabase } from "./lookup-cache.ts";
import { applyToGame } from "./match-service.ts";
import { MetadataProviderError } from "./provider-error.ts";
import type { MetadataProvider, NormalizedGameMetadata } from "./types.ts";

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
        .select({ id: games.id, platformSlug: platforms.slug })
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
    const externalId = externalIdFrom(identity.metadataJson, source);
    if (externalId === null) {
        return done(gameId, "skipped", `The ${identity.providerKey} match carries no ${source} id.`);
    }
    const stored = db
        .select()
        .from(metadataCandidates)
        .where(
            and(
                eq(metadataCandidates.gameId, gameId),
                eq(metadataCandidates.providerKey, options.provider.key),
                eq(metadataCandidates.providerGameId, externalId),
            ),
        )
        .get();
    let metadata: NormalizedGameMetadata | null = null;
    let reused = false;
    if (stored !== undefined && options.forceRefresh !== true) {
        metadata = readMetadata(stored.metadataJson);
        reused = metadata !== null;
    }
    if (metadata === null) {
        try {
            metadata = await options.provider.getGame(externalId, options.signal);
        } catch (error) {
            const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error.";
            const retryAfterMs = error instanceof MetadataProviderError ? error.retryAfterMs : null;
            return done(gameId, "error", message, null, retryAfterMs);
        }
        if (metadata === null) {
            return done(gameId, "not_found", `${source} has no game ${externalId}.`);
        }
    }
    const candidate = enrichmentCandidate({
        providerKey: options.provider.key,
        providerGameId: externalId,
        metadata,
        platformSlug: game.platformSlug,
        inheritedScore: identity.score,
        identityProviderKey: identity.providerKey,
        identityDetail: `Identity from ${identity.providerKey} (${identity.title}), scored ${identity.score.toFixed(2)}.`,
    });
    let appliedTitle: string | null = null;
    db.transaction((tx) => {
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
        if (candidate.platformSlug === null) return;
        tx.update(metadataCandidates)
            .set({ isSelected: false, updatedAt: now })
            .where(eq(metadataCandidates.gameId, gameId))
            .run();
        tx.update(metadataCandidates)
            .set({ isSelected: true, updatedAt: now })
            .where(
                and(
                    eq(metadataCandidates.gameId, gameId),
                    eq(metadataCandidates.providerKey, candidate.providerKey),
                    eq(metadataCandidates.providerGameId, candidate.providerGameId),
                ),
            )
            .run();
        appliedTitle = applyToGame(tx, gameId, candidate, now);
    });
    if (candidate.platformSlug === null) {
        return done(gameId, "skipped", candidate.reasons.at(-1)?.detail ?? "Platform disagreement.");
    }
    return done(gameId, reused ? "reused" : "enriched", null, appliedTitle);
}