import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { gameFiles, games, metadataCandidates, platforms } from "../../db/schema.ts";
import {
    createTestDatabase,
    seedTestPlatforms,
    type TestDatabaseHandle,
} from "../../tests/helpers/test-db.ts";
import { readLookup } from "./lookup-cache.ts";
import { identifyGame } from "./match-service.ts";
import type { HashMatchResult, MetadataCandidate, MetadataProvider } from "./types.ts";

let handle: TestDatabaseHandle;
let gameId = 0;
const now = new Date("2026-09-05T12:00:00Z");
const SHA1 = "3b6ba84809d4fb581ab0783d200cd1e51457749a";

function candidate(overrides: Partial<MetadataCandidate> = {}): MetadataCandidate {
    return {
        providerKey: "fake",
        providerGameId: "605483",
        score: 1,
        matchType: "hash",
        reasons: [{ code: "hash.sha1", delta: 1, detail: "exact" }],
        platformSlug: "nes",
        metadata: {
            title: "Zelda II: The Adventure of Link",
            sortTitle: "Zelda 2",
            summary: "A side-scrolling sequel.",
            releaseYear: 1988,
            developer: null,
            publisher: "Nintendo",
            genres: ["Action RPG"],
            regions: ["EU"],
            languages: ["en"],
            players: 1,
            coverUrl: null,
            externalIds: [],
        },
        ...overrides,
    };
}

function fakeProvider(result: HashMatchResult | Error): MetadataProvider & { calls: number } {
    const provider = {
        key: "fake",
        calls: 0,
        isConfigured: () => true,
        healthCheck: async () => ({ ok: true, latencyMs: 1, message: "ok" }),
        normalizeCached: (payload: unknown): MetadataCandidate[] =>
            payload === null ? [] : (payload as { candidates: MetadataCandidate[] }).candidates,
        matchByHashes: async (): Promise<HashMatchResult> => {
            provider.calls += 1;
            if (result instanceof Error) throw result;
            return result;
        },
        searchByTitle: async () => [],
        getGame: async () => null,
    };
    return provider;
}

function matched(candidates: MetadataCandidate[]): HashMatchResult {
    return { status: "matched", candidates, payload: { candidates }, latencyMs: 12000 };
}

const notFound: HashMatchResult = { status: "not_found", candidates: [], payload: null, latencyMs: 900 };

function addFile(extras: Record<string, unknown> = {}): void {
    handle.db
        .insert(gameFiles)
        .values({
            gameId,
            relativePath: `nes/zelda2-${Math.random()}.nes`,
            fileName: "zelda2.nes",
            extension: ".nes",
            sizeBytes: 262160,
            modifiedAtFs: now,
            sha1: SHA1,
            md5: "f8f0e28fe9461bae1e99fea3445c0e91",
            crc32: "6f151d25",
            ...extras,
        })
        .run();
}

beforeEach(() => {
    handle = createTestDatabase();
    seedTestPlatforms(handle.db);
    const nes = handle.db.select().from(platforms).where(eq(platforms.slug, "nes")).get();
    const inserted = handle.db
        .insert(games)
        .values({
            platformId: nes!.id,
            slug: "zelda-ii",
            title: "Zelda II",
            sortTitle: "Zelda II",
            filenameTitle: "Zelda II",
        })
        .returning({ id: games.id })
        .get();
    gameId = inserted.id;
});

afterEach(() => {
    handle.close();
});

describe("identifyGame", () => {
    it("applies a hash match to the game", async () => {
        addFile();
        const provider = fakeProvider(matched([candidate()]));
        const result = await identifyGame(handle.db, gameId, { provider, now });
        expect(result.outcome).toBe("matched");
        expect(result.appliedTitle).toBe("Zelda II: The Adventure of Link");
        const game = handle.db.select().from(games).where(eq(games.id, gameId)).get();
        expect(game?.title).toBe("Zelda II: The Adventure of Link");
        expect(game?.releaseYear).toBe(1988);
        expect(game?.publisher).toBe("Nintendo");
        expect(game?.genresJson).toEqual(["Action RPG"]);
        expect(game?.metadataStatus).toBe("matched");
        expect(game?.metadataConfidence).toBe(1);
        expect(game?.filenameTitle).toBe("Zelda II");
    });
    it("selects exactly one candidate", async () => {
        addFile();
        const provider = fakeProvider(
            matched([candidate(), candidate({ providerGameId: "999", score: 0.99 })]),
        );
        await identifyGame(handle.db, gameId, { provider, now });
        const rows = handle.db.select().from(metadataCandidates).all();
        expect(rows).toHaveLength(2);
        expect(rows.filter((row) => row.isSelected)).toHaveLength(1);
        expect(rows.find((row) => row.isSelected)?.providerGameId).toBe("605483");
    });
    it("serves the second call from cache", async () => {
        addFile();
        const provider = fakeProvider(matched([candidate()]));
        const first = await identifyGame(handle.db, gameId, { provider, now });
        const second = await identifyGame(handle.db, gameId, { provider, now });
        expect(first.fromCache).toBe(false);
        expect(second.fromCache).toBe(true);
        expect(second.outcome).toBe("matched");
        expect(provider.calls).toBe(1);
    });
    it("asks again when forced", async () => {
        addFile();
        const provider = fakeProvider(matched([candidate()]));
        await identifyGame(handle.db, gameId, { provider, now });
        await identifyGame(handle.db, gameId, { provider, now, forceRefresh: true });
        expect(provider.calls).toBe(2);
    });
    it("stores a miss and leaves the game alone", async () => {
        addFile();
        const provider = fakeProvider(notFound);
        const result = await identifyGame(handle.db, gameId, { provider, now });
        expect(result.outcome).toBe("not_found");
        expect(handle.db.select().from(games).where(eq(games.id, gameId)).get()?.title).toBe("Zelda II");
        expect(readLookup(handle.db, { providerKey: "fake", algorithm: "sha1", value: SHA1 }, now)?.status)
            .toBe("not_found");
    });
    it("caches an outage briefly instead of retrying every file", async () => {
        addFile();
        const provider = fakeProvider(new Error("boom"));
        const first = await identifyGame(handle.db, gameId, { provider, now });
        const second = await identifyGame(handle.db, gameId, { provider, now });
        expect(first.outcome).toBe("error");
        expect(second.outcome).toBe("error");
        expect(second.fromCache).toBe(true);
        expect(provider.calls).toBe(1);
    });
    it("stores but never applies a platform mismatch", async () => {
        addFile();
        const provider = fakeProvider(
            matched([candidate({ platformSlug: "snes", score: 0 })]),
        );
        const result = await identifyGame(handle.db, gameId, { provider, now });
        expect(result.outcome).toBe("partial");
        expect(handle.db.select().from(metadataCandidates).all()).toHaveLength(1);
        expect(handle.db.select().from(metadataCandidates).get()?.isSelected).toBe(false);
        const game = handle.db.select().from(games).where(eq(games.id, gameId)).get();
        expect(game?.title).toBe("Zelda II");
        expect(game?.metadataStatus).toBe("partial");
    });
    it("respects a manual lock", async () => {
        addFile();
        handle.db
            .update(games)
            .set({ manualFieldsJson: { title: true } })
            .where(eq(games.id, gameId))
            .run();
        const provider = fakeProvider(matched([candidate()]));
        await identifyGame(handle.db, gameId, { provider, now });
        const game = handle.db.select().from(games).where(eq(games.id, gameId)).get();
        expect(game?.title).toBe("Zelda II");
        expect(game?.publisher).toBe("Nintendo");
    });
    it("skips a game with no hashed file", async () => {
        const provider = fakeProvider(matched([candidate()]));
        const result = await identifyGame(handle.db, gameId, { provider, now });
        expect(result.outcome).toBe("skipped");
        expect(provider.calls).toBe(0);
    });
    it("never sends a fixture to a provider", async () => {
        addFile({ isFixture: true });
        const provider = fakeProvider(matched([candidate()]));
        const result = await identifyGame(handle.db, gameId, { provider, now });
        expect(result.outcome).toBe("skipped");
        expect(provider.calls).toBe(0);
    });
    it("upserts rather than duplicating on a repeat run", async () => {
        addFile();
        const provider = fakeProvider(matched([candidate()]));
        await identifyGame(handle.db, gameId, { provider, now });
        await identifyGame(handle.db, gameId, { provider, now, forceRefresh: true });
        expect(handle.db.select().from(metadataCandidates).all()).toHaveLength(1);
    });
});