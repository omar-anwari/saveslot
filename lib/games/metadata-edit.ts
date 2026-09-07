import { and, desc, eq } from "drizzle-orm";
import { games, metadataCandidates } from "../../db/schema.ts";
import { applyToGame } from "../metadata/match-service.ts";
import type { MetadataDatabase } from "../metadata/lookup-cache.ts";
import type { MetadataCandidate, NormalizedGameMetadata } from "../metadata/types.ts";

export function gameIdForSlug(db: MetadataDatabase, slug: string): number | null {
    const row = db.select({ id: games.id }).from(games).where(eq(games.slug, slug)).get();
    return row?.id ?? null;
}

export const EDITABLE_FIELDS = [
    "title",
    "sortTitle",
    "summary",
    "releaseYear",
    "developer",
    "publisher",
    "genres",
    "players",
    "region",
    "language",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export interface ManualEdits {
    title?: string;
    sortTitle?: string;
    summary?: string | null;
    releaseYear?: number | null;
    developer?: string | null;
    publisher?: string | null;
    genres?: string[];
    players?: number | null;
    region?: string | null;
    language?: string | null;
}

export interface EditResult {
    changed: EditableField[];
    locked: EditableField[];
}

function locksOf(value: unknown): Record<string, boolean> {
    return typeof value === "object" && value !== null
        ? { ...(value as Record<string, boolean>) }
        : {};
}

export function updateManualMetadata(
    db: MetadataDatabase,
    gameId: number,
    edits: ManualEdits,
    now: Date = new Date(),
): EditResult | null {
    const game = db
        .select({ id: games.id, manualFieldsJson: games.manualFieldsJson })
        .from(games)
        .where(eq(games.id, gameId))
        .get();
    if (game === undefined) return null;
    const locks = locksOf(game.manualFieldsJson);
    const set: Record<string, unknown> = { updatedAt: now };
    const changed: EditableField[] = [];
    for (const field of EDITABLE_FIELDS) {
        const value = edits[field];
        if (value === undefined) continue;
        set[field === "genres" ? "genresJson" : field] = value;
        locks[field] = true;
        changed.push(field);
    }
    if (changed.length === 0) return { changed: [], locked: Object.keys(locks) as EditableField[] };
    set.manualFieldsJson = locks;
    set.metadataStatus = "manual";
    db.update(games).set(set).where(eq(games.id, gameId)).run();
    return { changed, locked: Object.keys(locks) as EditableField[] };
}

function metadataOf(value: unknown): NormalizedGameMetadata | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    return typeof record.title === "string" ? (value as NormalizedGameMetadata) : null;
}

function selectedMetadata(db: MetadataDatabase, gameId: number): NormalizedGameMetadata | null {
    const row = db
        .select({ metadataJson: metadataCandidates.metadataJson })
        .from(metadataCandidates)
        .where(and(eq(metadataCandidates.gameId, gameId), eq(metadataCandidates.isSelected, true)))
        .get();
    return row === undefined ? null : metadataOf(row.metadataJson);
}

export function revertFields(
    db: MetadataDatabase,
    gameId: number,
    fields: readonly EditableField[],
    now: Date = new Date(),
): EditResult | null {
    const game = db
        .select({
            id: games.id,
            filenameTitle: games.filenameTitle,
            manualFieldsJson: games.manualFieldsJson,
        })
        .from(games)
        .where(eq(games.id, gameId))
        .get();
    if (game === undefined) return null;
    const provider = selectedMetadata(db, gameId);
    const locks = locksOf(game.manualFieldsJson);
    const set: Record<string, unknown> = { updatedAt: now };
    const changed: EditableField[] = [];
    for (const field of fields) {
        delete locks[field];
        changed.push(field);
        switch (field) {
            case "title":
                set.title = provider?.title ?? game.filenameTitle;
                break;
            case "genres":
                set.genresJson = provider === null ? [] : [...provider.genres];
                break;
            case "region":
                set.region = provider === null || provider.regions.length === 0
                    ? null
                    : provider.regions.join(", ");
                break;
            case "language":
                set.language = provider === null || provider.languages.length === 0
                    ? null
                    : provider.languages.join(", ");
                break;
            default:
                set[field] = provider === null ? null : (provider[field] ?? null);
                break;
        }
    }

    if (changed.length === 0) return { changed: [], locked: Object.keys(locks) as EditableField[] };
    set.manualFieldsJson = locks;
    if (Object.keys(locks).length === 0 && provider !== null) {
        set.metadataStatus = "matched";
    }
    db.update(games).set(set).where(eq(games.id, gameId)).run();
    return { changed, locked: Object.keys(locks) as EditableField[] };
}

function candidateFromRow(row: {
    providerKey: string;
    providerGameId: string;
    score: number;
    matchType: string;
    platformSlug: string | null;
    metadataJson: unknown;
}): MetadataCandidate | null {
    const metadata = metadataOf(row.metadataJson);
    if (metadata === null) return null;
    return {
        providerKey: row.providerKey,
        providerGameId: row.providerGameId,
        score: row.score,
        matchType: row.matchType === "hash" ? "hash" : "title",
        reasons: [],
        platformSlug: row.platformSlug,
        metadata,
    };
}

export function selectCandidate(
    db: MetadataDatabase,
    gameId: number,
    providerKey: string,
    providerGameId: string,
    now: Date = new Date(),
): { title: string } | null {
    const row = db
        .select()
        .from(metadataCandidates)
        .where(
            and(
                eq(metadataCandidates.gameId, gameId),
                eq(metadataCandidates.providerKey, providerKey),
                eq(metadataCandidates.providerGameId, providerGameId),
            ),
        )
        .get();
    if (row === undefined) return null;
    const candidate = candidateFromRow(row);
    if (candidate === null) return null;
    db.transaction((tx) => {
        tx.update(metadataCandidates)
            .set({ isSelected: false, updatedAt: now })
            .where(eq(metadataCandidates.gameId, gameId))
            .run();
        tx.update(metadataCandidates)
            .set({ isSelected: true, updatedAt: now })
            .where(eq(metadataCandidates.id, row.id))
            .run();
        applyToGame(tx, gameId, candidate, now);
    });
    return { title: candidate.metadata.title };
}

export function listCandidates(db: MetadataDatabase, gameId: number) {
    return db
        .select()
        .from(metadataCandidates)
        .where(eq(metadataCandidates.gameId, gameId))
        .orderBy(desc(metadataCandidates.score))
        .all();
}