import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { games, metadataCandidates, platforms } from "../../db/schema.ts";
import {
    createTestDatabase,
    seedTestPlatforms,
    type TestDatabaseHandle,
} from "../../tests/helpers/test-db.ts";
import { enrichGame } from "./enrich-service.ts";
import type { MetadataProvider, NormalizedGameMetadata } from "./types.ts";

let handle: TestDatabaseHandle;
let gameId = 0;
const now = new Date("2026-09-05T12:00:00Z");

function igdbMetadata(overrides: Partial<NormalizedGameMetadata> = {}): NormalizedGameMetadata {
    return {
        title: "Zelda II: The Adventure of Link",
        sortTitle: null,
        summary: "A side-scrolling sequel.",
        releaseYear: 1987,
        developer: "Nintendo R&D4",
        publisher: "Nintendo",
        genres: ["Platform", "Role-playing (RPG)"],
        regions: [],
        languages: [],
        players: 1,
        rating: 65.36,
        platformSlugs: ["nes"],
        coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1uje.jpg",
        externalIds: [{ source: "IGDB", id: "1025", url: "https://igdb.test/1025", confidence: "verified" }],
        ...overrides,
    };
}

function fakeProvider(result: NormalizedGameMetadata | null | Error) {
    const getGame = vi.fn(async (_id: string, _signal?: AbortSignal) => {
        if (result instanceof Error) throw result;
        return result;
    });
    return {
        getGame,
        provider: {
            key: "igdb",
            isConfigured: () => true,
            healthCheck: async () => ({ ok: true, latencyMs: 1, message: "ok" }),
            matchByHashes: async () => ({ status: "not_found" as const, candidates: [], payload: null, latencyMs: 0 }),
            normalizeCached: () => [],
            searchByTitle: async () => [],
            getGame,
        } as unknown as MetadataProvider,
    };
}

function addIdentity(overrides: Record<string, unknown> = {}): void {
    handle.db
        .insert(metadataCandidates)
        .values({
            gameId,
            providerKey: "hasheous",
            providerGameId: "605483",
            score: 1,
            matchType: "hash",
            platformSlug: "nes",
            title: "Zelda 2 - The Adventure Of Link",
            metadataJson: {
                title: "Zelda 2 - The Adventure Of Link",
                platformSlugs: ["nes"],
                externalIds: [{ source: "IGDB", id: "1025", url: null, confidence: "automatic" }],
            },
            reasonsJson: [{ code: "hash.sha1", delta: 1, detail: "exact" }],
            isSelected: true,
            createdAt: now,
            updatedAt: now,
            ...overrides,
        })
        .run();
}

beforeEach(() => {
    handle = createTestDatabase();
    seedTestPlatforms(handle.db);
    const nes = handle.db.select().from(platforms).where(eq(platforms.slug, "nes")).get();
    gameId = handle.db
        .insert(games)
        .values({
            platformId: nes!.id,
            slug: "zelda-ii",
            title: "Zelda 2 - The Adventure Of Link",
            sortTitle: "Zelda 2",
            filenameTitle: "Zelda II - The Adventure of Link (axekin.com)",
        })
        .returning({ id: games.id })
        .get().id;
});

afterEach(() => {
    handle.close();
});

describe("enrichGame", () => {
    it("describes a hash-identified game with the richer provider", async () => {
        addIdentity();
        const { provider, getGame } = fakeProvider(igdbMetadata());
        const result = await enrichGame(handle.db, gameId, { provider, now });
        expect(result.outcome).toBe("enriched");
        expect(getGame).toHaveBeenCalledWith("1025", undefined);
        const game = handle.db.select().from(games).where(eq(games.id, gameId)).get();
        expect(game?.title).toBe("Zelda II: The Adventure of Link");
        expect(game?.developer).toBe("Nintendo R&D4");
        expect(game?.publisher).toBe("Nintendo");
        expect(game?.releaseYear).toBe(1987);
        expect(game?.metadataProvider).toBe("igdb");
        expect(game?.metadataProviderId).toBe("1025");
        expect(game?.metadataConfidence).toBe(1);
        expect(game?.filenameTitle).toBe("Zelda II - The Adventure of Link (axekin.com)");
    });
    it("moves the selection but keeps the identifying candidate", async () => {
        addIdentity();
        const { provider } = fakeProvider(igdbMetadata());
        await enrichGame(handle.db, gameId, { provider, now });
        const rows = handle.db.select().from(metadataCandidates).all();
        expect(rows).toHaveLength(2);
        expect(rows.filter((row) => row.isSelected)).toHaveLength(1);
        expect(rows.find((row) => row.isSelected)?.providerKey).toBe("igdb");
        expect(rows.find((row) => row.providerKey === "hasheous")).toBeDefined();
    });
    it("records where the identity came from", async () => {
        addIdentity();
        const { provider } = fakeProvider(igdbMetadata());
        await enrichGame(handle.db, gameId, { provider, now });
        const row = handle.db
            .select()
            .from(metadataCandidates)
            .where(eq(metadataCandidates.providerKey, "igdb"))
            .get();
        const codes = (row?.reasonsJson ?? []).map((reason) => (reason as { code: string }).code);
        expect(codes).toContain("identity.inherited");
        expect(codes).toContain("platform.member");
    });
    it("reuses a stored description instead of calling out again", async () => {
        addIdentity();
        const { provider, getGame } = fakeProvider(igdbMetadata());
        await enrichGame(handle.db, gameId, { provider, now });
        const second = await enrichGame(handle.db, gameId, { provider, now });
        expect(second.outcome).toBe("reused");
        expect(getGame).toHaveBeenCalledTimes(1);
    });
    it("fetches again when forced", async () => {
        addIdentity();
        const { provider, getGame } = fakeProvider(igdbMetadata());
        await enrichGame(handle.db, gameId, { provider, now });
        await enrichGame(handle.db, gameId, { provider, now, forceRefresh: true });
        expect(getGame).toHaveBeenCalledTimes(2);
    });
    it("stores but does not apply a platform disagreement", async () => {
        addIdentity();
        const { provider } = fakeProvider(igdbMetadata({ platformSlugs: ["snes", "gba"] }));
        const result = await enrichGame(handle.db, gameId, { provider, now });
        expect(result.outcome).toBe("skipped");
        const game = handle.db.select().from(games).where(eq(games.id, gameId)).get();
        expect(game?.title).toBe("Zelda 2 - The Adventure Of Link");
        expect(
            handle.db.select().from(metadataCandidates).where(eq(metadataCandidates.providerKey, "igdb")).get(),
        ).toBeDefined();
    });
    it("applies when the provider knows no platform we support", async () => {
        addIdentity();
        const { provider } = fakeProvider(igdbMetadata({ platformSlugs: [] }));
        const result = await enrichGame(handle.db, gameId, { provider, now });
        expect(result.outcome).toBe("enriched");
        expect(handle.db.select().from(games).where(eq(games.id, gameId)).get()?.title)
            .toBe("Zelda II: The Adventure of Link");
    });
    it("respects a manual lock", async () => {
        addIdentity();
        handle.db.update(games).set({ manualFieldsJson: { title: true } }).where(eq(games.id, gameId)).run();
        const { provider } = fakeProvider(igdbMetadata());
        await enrichGame(handle.db, gameId, { provider, now });
        const game = handle.db.select().from(games).where(eq(games.id, gameId)).get();
        expect(game?.title).toBe("Zelda 2 - The Adventure Of Link");
        expect(game?.publisher).toBe("Nintendo");
    });
    it("skips a game nothing has identified", async () => {
        const { provider, getGame } = fakeProvider(igdbMetadata());
        const result = await enrichGame(handle.db, gameId, { provider, now });
        expect(result.outcome).toBe("skipped");
        expect(result.message).toContain("Not identified");
        expect(getGame).not.toHaveBeenCalled();
    });
    it("skips when the identity carries no id for this provider", async () => {
        addIdentity({ metadataJson: { title: "x", platformSlugs: ["nes"], externalIds: [] } });
        const { provider, getGame } = fakeProvider(igdbMetadata());
        const result = await enrichGame(handle.db, gameId, { provider, now });
        expect(result.outcome).toBe("skipped");
        expect(result.message).toContain("no IGDB id");
        expect(getGame).not.toHaveBeenCalled();
    });
    it("reports a provider failure with its retry window", async () => {
        addIdentity();
        const error = Object.assign(new Error("IGDB rate limit exceeded."), {
            name: "MetadataProviderError",
            retryAfterMs: 5000,
        });
        const { provider } = fakeProvider(error);
        const result = await enrichGame(handle.db, gameId, { provider, now });
        expect(result.outcome).toBe("error");
        expect(result.message).toContain("rate limit");
    });
});