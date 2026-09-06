import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MetadataProviderError } from "../provider-error.ts";
import { coverUrlFor, createIgdbProvider, normalizeIgdbGame } from "./igdb.ts";
import type { IgdbClient } from "./igdb-client.ts";

let games: unknown[];
let zelda2: unknown;

beforeAll(async () => {
    const file = path.join(process.cwd(), "tests/fixtures/igdb/games.json");
    games = JSON.parse(await readFile(file, "utf8")) as unknown[];
    zelda2 = games.find((game) => (game as { id: number }).id === 1025);
});

function fakeClient(result: unknown[] | Error) {
    const query = vi.fn(async (_endpoint: string, _apicalypse: string, _signal?: AbortSignal) => {
        if (result instanceof Error) throw result;
        return result;
    });
    return { client: { query, ensureToken: async () => undefined } as unknown as IgdbClient, query };
}

describe("normalizeIgdbGame", () => {
    it("reads the real recorded response", () => {
        const metadata = normalizeIgdbGame(zelda2);
        expect(metadata?.title).toBe("Zelda II: The Adventure of Link");
        expect(metadata?.releaseYear).toBe(1987);
        expect(metadata?.summary?.startsWith("Zelda II")).toBe(true);
        expect(metadata?.genres).toContain("Platform");
    });
    it("uses the booleans, not the order, for developer and publisher", () => {
        const metadata = normalizeIgdbGame(zelda2);
        expect(metadata?.developer).toBe("Nintendo R&D4");
        expect(metadata?.publisher).toBe("Nintendo");
    });
    it("maps every platform the game released on", () => {
        const metadata = normalizeIgdbGame(zelda2);
        expect(metadata?.platformSlugs).toContain("nes");
        expect(metadata?.platformSlugs).toEqual(["nes"]);
    });
    it("builds a cover URL from the image id", () => {
        expect(normalizeIgdbGame(zelda2)?.coverUrl).toBe(
            "https://images.igdb.com/igdb/image/upload/t_cover_big/co1uje.jpg",
        );
        expect(coverUrlFor("co1uje", "t_1080p")).toBe(
            "https://images.igdb.com/igdb/image/upload/t_1080p/co1uje.jpg",
        );
    });
    it("links back to the game on igdb.com", () => {
        const external = normalizeIgdbGame(zelda2)?.externalIds[0];
        expect(external?.source).toBe("IGDB");
        expect(external?.id).toBe("1025");
        expect(external?.url).toBe("https://www.igdb.com/games/zelda-ii-the-adventure-of-link");
    });
    it("only claims a player count it can defend", () => {
        expect(normalizeIgdbGame(zelda2)?.players).toBe(1);
        expect(
            normalizeIgdbGame({
                id: 1,
                name: "Co-op Game",
                game_modes: [{ name: "Single player" }, { name: "Multiplayer" }],
            })?.players,
        ).toBeNull();
    });
    it("survives a game with almost nothing on it", () => {
        const metadata = normalizeIgdbGame({ id: 9, name: "Bare" });
        expect(metadata?.title).toBe("Bare");
        expect(metadata?.releaseYear).toBeNull();
        expect(metadata?.coverUrl).toBeNull();
        expect(metadata?.platformSlugs).toEqual([]);
    });
    it("rejects a shape it does not recognize", () => {
        expect(() => normalizeIgdbGame({ id: "not a number" })).toThrow(MetadataProviderError);
        expect(normalizeIgdbGame({ id: 1 })).toBeNull();
    });
});

describe("createIgdbProvider", () => {
    it("fetches a game by id", async () => {
        const { client, query } = fakeClient([zelda2]);
        const provider = createIgdbProvider({ client, enabled: true });
        const metadata = await provider.getGame("1025");
        expect(metadata?.title).toBe("Zelda II: The Adventure of Link");
        expect(query.mock.calls[0]?.[1]).toContain("where id = 1025;");
    });
    it("refuses an id that is not a bare number", async () => {
        const { client, query } = fakeClient([zelda2]);
        const provider = createIgdbProvider({ client, enabled: true });
        expect(await provider.getGame("1025; drop *")).toBeNull();
        expect(await provider.getGame("")).toBeNull();
        expect(query).not.toHaveBeenCalled();
    });
    it("returns null when IGDB has no such game", async () => {
        const { client } = fakeClient([]);
        const provider = createIgdbProvider({ client, enabled: true });
        expect(await provider.getGame("999999999")).toBeNull();
    });
    it("does not pretend to do hash matching", async () => {
        const { client, query } = fakeClient([]);
        const provider = createIgdbProvider({ client, enabled: true });
        const result = await provider.matchByHashes({
            crc32: "a", md5: "b", sha1: "c", platformSlug: "nes", fileSize: 1,
        });
        expect(result.status).toBe("not_found");
        expect(query).not.toHaveBeenCalled();
    });
    it("scores platform membership, not equality", () => {
        const { client } = fakeClient([]);
        const provider = createIgdbProvider({ client, enabled: true });
        const [agreeing] = provider.normalizeCached([zelda2], {
            crc32: null, md5: null, sha1: null, platformSlug: "nes", fileSize: null,
        });
        const [disagreeing] = provider.normalizeCached([zelda2], {
            crc32: null, md5: null, sha1: null, platformSlug: "snes", fileSize: null,
        });
        expect(agreeing?.score).toBe(0.95);
        expect(agreeing?.reasons.map((reason) => reason.code)).toContain("platform.member");
        expect(disagreeing?.score).toBe(0);
        expect(disagreeing?.platformSlug).toBeNull();
    });
    it("reports health without a data query", async () => {
        const { client } = fakeClient([{ id: 1025 }]);
        const provider = createIgdbProvider({ client, enabled: true });
        expect((await provider.healthCheck()).ok).toBe(true);
    });
    it("strips a revision marker before searching", async () => {
        const { client, query } = fakeClient([]);
        const provider = createIgdbProvider({ client, enabled: true });
        await provider.searchByTitle({
            title: "Legend of Zelda, The - Link's Awakening Rev 1",
            platformSlug: "gb",
            releaseYear: null,
            limit: 10,
        });
        const body = query.mock.calls[0]?.[1] ?? "";
        expect(body).toContain(`search "Legend of Zelda, The - Link's Awakening";`);
        expect(body).toContain("where platforms = (33);");
    });
});