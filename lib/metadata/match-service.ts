import { and, eq } from "drizzle-orm";
import { gameFiles, games, metadataCandidates, platforms } from "../../db/schema.ts";
import {
    chooseLookupHash,
    readLookup,
    writeLookup,
    type LookupKey,
    type MetadataDatabase,
} from "./lookup-cache.ts";
import { MetadataProviderError } from "./provider-error.ts";
import type { HashMatchInput, MetadataCandidate, MetadataProvider } from "./types.ts";

export const AUTO_SELECT_MIN_SCORE = 0.98;
export type MatchOutcome = "matched" | "partial" | "not_found" | "skipped" | "error";
export interface MatchGameResult {
    gameId: number;
    outcome: MatchOutcome;
    fromCache: boolean;
    candidateCount: number;
    appliedTitle: string | null;
    message: string | null;
    retryAfterMs: number | null;
}
export interface IdentifyOptions {
    provider: MetadataProvider;
    signal?: AbortSignal;
    now?: Date;
    forceRefresh?: boolean;
}

function skip(gameId: number, message: string): MatchGameResult {
    return {
        gameId, outcome: "skipped", fromCache: false, candidateCount: 0,
        appliedTitle: null, message, retryAfterMs: null,
    };
}

export async function identifyGame(
    db: MetadataDatabase,
    gameId: number,
    options: IdentifyOptions,
): Promise<MatchGameResult> {
    const now = options.now ?? new Date();
    const game = db
        .select({ id: games.id, platformSlug: platforms.slug })
        .from(games)
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .where(eq(games.id, gameId))
        .get();
    if (game === undefined) return skip(gameId, "No such game.");
    const files = db
        .select({
            sha1: gameFiles.sha1,
            md5: gameFiles.md5,
            crc32: gameFiles.crc32,
            sizeBytes: gameFiles.sizeBytes,
            isFixture: gameFiles.isFixture,
        })
        .from(gameFiles)
        .where(
            and(
                eq(gameFiles.gameId, gameId),
                eq(gameFiles.present, true),
                eq(gameFiles.fileRole, "primary"),
            ),
        )
        .all();
    const usable = files.filter((entry) => !entry.isFixture);
    const file =
        usable.find((entry) => entry.sha1 !== null) ??
        usable.find((entry) => entry.md5 !== null) ??
        usable.find((entry) => entry.crc32 !== null);
    if (file === undefined) {
        if (files.length === 0) return skip(gameId, "No file present. Run a scan.");
        if (usable.length === 0) return skip(gameId, "Fixture file; never sent to a provider.");
        return skip(gameId, "No checksums yet. Run: pnpm scan --mode hashes-only");
    }
    const chosen = chooseLookupHash(file);
    if (chosen === null) return skip(gameId, "No usable checksum.");
    const input: HashMatchInput = {
        crc32: file.crc32,
        md5: file.md5,
        sha1: file.sha1,
        platformSlug: game.platformSlug,
        fileSize: file.sizeBytes,
    };
    const key: LookupKey = {
        providerKey: options.provider.key,
        algorithm: chosen.algorithm,
        value: chosen.value,
    };
    const cached = options.forceRefresh === true ? null : readLookup(db, key, now);
    let candidates: readonly MetadataCandidate[] = [];
    let fromCache = false;
    if (cached !== null) {
        fromCache = true;
        if (cached.status === "error") {
            return {
                gameId, outcome: "error", fromCache: true, candidateCount: 0, appliedTitle: null,
                message: `Cached provider error: ${cached.errorMessage ?? "unknown"}`,
                retryAfterMs: null,
            };
        }
        if (cached.status === "not_found") {
            return { gameId, outcome: "not_found", fromCache: true, candidateCount: 0, appliedTitle: null, message: null, retryAfterMs: null };
        }
        candidates = options.provider.normalizeCached(cached.payload, input);
    } else {
        try {
            const result = await options.provider.matchByHashes(input, options.signal);
            writeLookup(
                db, key,
                { status: result.status, payload: result.payload, latencyMs: result.latencyMs },
                now,
            );
            if (result.status === "not_found") {
                return { gameId, outcome: "not_found", fromCache: false, candidateCount: 0, appliedTitle: null, message: null, retryAfterMs: null };
            }
            candidates = result.candidates;
        } catch (error) {
            const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error.";
            const retryAfterMs =
                error instanceof MetadataProviderError ? error.retryAfterMs : null;
            writeLookup(db, key, { status: "error", errorMessage: message, ttlMs: retryAfterMs }, now);
            return {
                gameId, outcome: "error", fromCache: false, candidateCount: 0,
                appliedTitle: null, message, retryAfterMs,
            };
        }
    }
    return persist(db, game.id, game.platformSlug, candidates, fromCache, now);
}

function persist(
    db: MetadataDatabase,
    gameId: number,
    platformSlug: string,
    candidates: readonly MetadataCandidate[],
    fromCache: boolean,
    now: Date,
): MatchGameResult {
    let appliedTitle: string | null = null;
    let outcome: MatchOutcome = candidates.length > 0 ? "partial" : "not_found";
    db.transaction((tx) => {
        for (const candidate of candidates) {
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
        const best = candidates
            .filter(
                (candidate) =>
                    candidate.matchType === "hash" &&
                    candidate.platformSlug === platformSlug &&
                    candidate.score >= AUTO_SELECT_MIN_SCORE,
            )
            .sort((a, b) => b.score - a.score)[0];
        tx.update(metadataCandidates)
            .set({ isSelected: false, updatedAt: now })
            .where(eq(metadataCandidates.gameId, gameId))
            .run();
        if (best === undefined) {
            tx.update(games)
                .set({
                    metadataStatus: candidates.length > 0 ? "partial" : "unmatched",
                    updatedAt: now,
                })
                .where(eq(games.id, gameId))
                .run();
            return;
        }
        tx.update(metadataCandidates)
            .set({ isSelected: true, updatedAt: now })
            .where(
                and(
                    eq(metadataCandidates.gameId, gameId),
                    eq(metadataCandidates.providerKey, best.providerKey),
                    eq(metadataCandidates.providerGameId, best.providerGameId),
                ),
            )
            .run();
        appliedTitle = applyToGame(tx, gameId, best, now);
        outcome = "matched";
    });
    return {
        gameId,
        outcome,
        fromCache,
        candidateCount: candidates.length,
        appliedTitle,
        message: null,
        retryAfterMs: null,
    };
}

export type Transaction = Parameters<Parameters<MetadataDatabase["transaction"]>[0]>[0];

export function applyToGame(
    tx: Transaction,
    gameId: number,
    candidate: MetadataCandidate,
    now: Date,
): string | null {
    const current = tx
        .select({ manualFieldsJson: games.manualFieldsJson })
        .from(games)
        .where(eq(games.id, gameId))
        .get();
    const locked = current?.manualFieldsJson ?? {};
    const meta = candidate.metadata;
    const set: Record<string, unknown> = {
        metadataStatus: "matched",
        metadataProvider: candidate.providerKey,
        metadataProviderId: candidate.providerGameId,
        metadataConfidence: candidate.score,
        updatedAt: now,
    };
    const assign = (field: string, value: unknown): void => {
        if (locked[field] === true || value === null) return;
        set[field] = value;
    };
    assign("title", meta.title);
    assign("sortTitle", meta.sortTitle);
    assign("summary", meta.summary);
    assign("releaseYear", meta.releaseYear);
    assign("developer", meta.developer);
    assign("publisher", meta.publisher);
    assign("players", meta.players);
    assign("rating", meta.rating);
    if (meta.genres.length > 0) assign("genresJson", [...meta.genres]);
    tx.update(games).set(set).where(eq(games.id, gameId)).run();
    return locked.title === true ? null : meta.title;
}