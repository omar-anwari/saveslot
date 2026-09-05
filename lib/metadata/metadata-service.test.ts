import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { gameFiles, games, platforms } from "../../db/schema.ts";
import {
    createTestDatabase,
    seedTestPlatforms,
    type TestDatabaseHandle,
} from "../../tests/helpers/test-db.ts";
import { MAX_CONSECUTIVE_ERRORS, runMetadataPass } from "./metadata-service.ts";
import type { HashMatchResult, MetadataCandidate, MetadataProvider } from "./types.ts";

let handle: TestDatabaseHandle;
const now = new Date("2026-09-05T12:00:00Z");

function candidateFor(title: string, platformSlug: string): MetadataCandidate {
    return {
        providerKey: "fake",
        providerGameId: title,
        score: 1,
        matchType: "hash",
        reasons: [],
        platformSlug,
        metadata: {
            title, sortTitle: null, summary: null, releaseYear: null,
            developer: null, publisher: null, genres: [], regions: [],
            languages: [], players: null, coverUrl: null, externalIds: [],
        },
    };
}

function fakeProvider(
    answer: (sha1: string) => HashMatchResult | Error,
): MetadataProvider & { calls: number } {
    const provider = {
        key: "fake",
        calls: 0,
        isConfigured: () => true,
        healthCheck: async () => ({ ok: true, latencyMs: 1, message: "ok" }),
        normalizeCached: (payload: unknown): MetadataCandidate[] =>
            payload === null ? [] : (payload as { candidates: MetadataCandidate[] }).candidates,
        matchByHashes: async (input: { sha1: string | null }): Promise<HashMatchResult> => {
            provider.calls += 1;
            const result = answer(input.sha1 ?? "");
            if (result instanceof Error) throw result;
            return result;
        },
        searchByTitle: async () => [],
        getGame: async () => null,
    };
    return provider as unknown as MetadataProvider & { calls: number };
}

function addGame(slug: string, platformSlug: string, sha1: string): number {
    const platform = handle.db.select().from(platforms).where(eq(platforms.slug, platformSlug)).get();
    const game = handle.db
        .insert(games)
        .values({
            platformId: platform!.id,
            slug,
            title: slug,
            sortTitle: slug,
            filenameTitle: slug,
        })
        .returning({ id: games.id })
        .get();
    handle.db
        .insert(gameFiles)
        .values({
            gameId: game.id,
            relativePath: `${platformSlug}/${slug}.rom`,
            fileName: `${slug}.rom`,
            extension: ".rom",
            sizeBytes: 1024,
            modifiedAtFs: now,
            sha1,
        })
        .run();
    return game.id;
}

beforeEach(() => {
    handle = createTestDatabase();
    seedTestPlatforms(handle.db);
});
afterEach(() => {
    handle.close();
});

describe("runMetadataPass", () => {
    it("matches every unmatched game", async () => {
        addGame("alpha", "nes", "a".repeat(40));
        addGame("beta", "gb", "b".repeat(40));
        const provider = fakeProvider((sha1) => {
            const candidates = [candidateFor(sha1[0] === "a" ? "Alpha" : "Beta", sha1[0] === "a" ? "nes" : "gb")];
            return { status: "matched", candidates, payload: { candidates }, latencyMs: 10 };
        });
        const summary = await runMetadataPass(handle.db, { provider, now });
        expect(summary).toMatchObject({ total: 2, matched: 2, errors: 0 });
        expect(handle.db.select().from(games).where(eq(games.slug, "alpha")).get()?.title).toBe("Alpha");
    });
    it("skips games already matched", async () => {
        addGame("alpha", "nes", "a".repeat(40));
        const provider = fakeProvider((sha1) => {
            const candidates = [candidateFor("Alpha", "nes")];
            return { status: "matched", candidates, payload: { candidates }, latencyMs: 10 };
        });
        await runMetadataPass(handle.db, { provider, now });
        const second = await runMetadataPass(handle.db, { provider, now });
        expect(second.total).toBe(0);
        expect(provider.calls).toBe(1);
    });
    it("revisits them when asked", async () => {
        addGame("alpha", "nes", "a".repeat(40));
        const provider = fakeProvider(() => {
            const candidates = [candidateFor("Alpha", "nes")];
            return { status: "matched", candidates, payload: { candidates }, latencyMs: 10 };
        });
        await runMetadataPass(handle.db, { provider, now });
        const second = await runMetadataPass(handle.db, { provider, now, includeMatched: true });
        expect(second.total).toBe(1);
        expect(second.fromCache).toBe(1);
    });
    it("filters by platform and honours a limit", async () => {
        addGame("alpha", "nes", "a".repeat(40));
        addGame("beta", "nes", "b".repeat(40));
        addGame("gamma", "gb", "c".repeat(40));
        const provider = fakeProvider(() => ({ status: "not_found", candidates: [], payload: null, latencyMs: 1 }));
        expect((await runMetadataPass(handle.db, { provider, now, platformSlug: "gb" })).total).toBe(1);
        expect((await runMetadataPass(handle.db, { provider, now, limit: 2 })).total).toBe(2);
    });
    it("gives up when the provider is down", async () => {
        for (let index = 0; index < 10; index += 1) {
            addGame(`game-${index}`, "nes", String(index).repeat(40).slice(0, 40));
        }
        const provider = fakeProvider(() => new Error("ECONNREFUSED"));
        const summary = await runMetadataPass(handle.db, { provider, now });
        expect(summary.errors).toBe(MAX_CONSECUTIVE_ERRORS);
        expect(summary.abortedReason).toContain("stopping");
        expect(provider.calls).toBe(MAX_CONSECUTIVE_ERRORS);
        expect(summary.total).toBe(10);
    });
    it("reports progress per game", async () => {
        addGame("alpha", "nes", "a".repeat(40));
        addGame("beta", "nes", "b".repeat(40));
        const provider = fakeProvider(() => ({ status: "not_found", candidates: [], payload: null, latencyMs: 1 }));
        const seen: number[] = [];
        await runMetadataPass(handle.db, {
            provider, now,
            onProgress: (_result, index, total) => { seen.push(index); expect(total).toBe(2); },
        });
        expect(seen).toEqual([0, 1]);
    });
    it("stops on an abort signal", async () => {
        addGame("alpha", "nes", "a".repeat(40));
        addGame("beta", "nes", "b".repeat(40));
        const controller = new AbortController();
        controller.abort();
        const provider = fakeProvider(() => ({ status: "not_found", candidates: [], payload: null, latencyMs: 1 }));
        const summary = await runMetadataPass(handle.db, { provider, now, signal: controller.signal });
        expect(summary.abortedReason).toBe("Cancelled.");
        expect(provider.calls).toBe(0);
    });
});