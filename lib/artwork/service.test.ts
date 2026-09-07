import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { games, metadataCandidates, platforms } from "../../db/schema.ts";
import {
    createTestDatabase,
    seedTestPlatforms,
    type TestDatabaseHandle,
} from "../../tests/helpers/test-db.ts";
import { cacheCoverArt } from "./service.ts";

let handle: TestDatabaseHandle;
let dataRoot = "";
let gameId = 0;

const COVER_URL = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1uje.jpg";
const now = new Date("2026-09-07T12:00:00Z");
const publicDns = async () => [{ address: "104.16.0.1" }];

let png: Uint8Array;

function body(bytes: Uint8Array): ArrayBuffer {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
}

function respondWith(bytes: Uint8Array) {
    return vi.fn().mockImplementation(() =>
        Promise.resolve(
            new Response(body(bytes), { status: 200, headers: { "content-type": "image/png" } }),
        ),
    );
}

function addCandidate(coverUrl: string | null, selected = true): void {
    handle.db
        .insert(metadataCandidates)
        .values({
            gameId,
            providerKey: "igdb",
            providerGameId: "1025",
            score: 1,
            matchType: "title",
            platformSlug: "nes",
            title: "Zelda II",
            metadataJson: coverUrl === null ? { title: "Zelda II" } : { title: "Zelda II", coverUrl },
            reasonsJson: [],
            isSelected: selected,
        })
        .run();
}

function currentGame() {
    return handle.db.select().from(games).where(eq(games.id, gameId)).get();
}

beforeEach(async () => {
    handle = createTestDatabase();
    seedTestPlatforms(handle.db);
    dataRoot = await mkdtemp(path.join(tmpdir(), "saveslot-cover-"));
    png = new Uint8Array(
        await sharp({ create: { width: 800, height: 1067, channels: 3, background: "#284" } })
            .png()
            .toBuffer(),
    );
    const nes = handle.db.select().from(platforms).where(eq(platforms.slug, "nes")).get();
    gameId = handle.db
        .insert(games)
        .values({
            platformId: nes!.id,
            slug: "zelda-ii",
            title: "Zelda II",
            sortTitle: "Zelda II",
            filenameTitle: "Zelda II",
        })
        .returning({ id: games.id })
        .get().id;
});

afterEach(async () => {
    handle.close();
    await rm(dataRoot, { recursive: true, force: true });
});

describe("cacheCoverArt", () => {
    it("fetches, derives and records both sizes", async () => {
        addCandidate(COVER_URL);
        const fetchImpl = respondWith(png);
        const result = await cacheCoverArt(handle.db, gameId, {
            dataRoot, now, lookupImpl: publicDns,
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result.outcome).toBe("cached");
        const game = currentGame();
        expect(game?.coverPath).toMatch(/^artwork\/cover\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/);
        expect(game?.coverThumbPath).toMatch(/^artwork\/thumb\//);
        expect(game?.coverSourceUrl).toBe(COVER_URL);
        expect(game?.coverUpdatedAt?.getTime()).toBe(now.getTime());
        for (const relative of [game!.coverPath!, game!.coverThumbPath!]) {
            expect((await stat(path.join(dataRoot, relative))).size).toBeGreaterThan(0);
        }
    });
    it("does not fetch again when nothing has changed", async () => {
        addCandidate(COVER_URL);
        const fetchImpl = respondWith(png);
        const options = { dataRoot, now, lookupImpl: publicDns, fetchImpl: fetchImpl as unknown as typeof fetch };
        await cacheCoverArt(handle.db, gameId, options);
        const second = await cacheCoverArt(handle.db, gameId, options);
        expect(second.outcome).toBe("reused");
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
    it("fetches again when forced", async () => {
        addCandidate(COVER_URL);
        const fetchImpl = respondWith(png);
        const options = { dataRoot, now, lookupImpl: publicDns, fetchImpl: fetchImpl as unknown as typeof fetch };
        await cacheCoverArt(handle.db, gameId, options);
        const second = await cacheCoverArt(handle.db, gameId, { ...options, forceRefresh: true });
        expect(second.outcome).toBe("cached");
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
    it("refetches when the row points at a file that is gone", async () => {
        addCandidate(COVER_URL);
        const fetchImpl = respondWith(png);
        const options = { dataRoot, now, lookupImpl: publicDns, fetchImpl: fetchImpl as unknown as typeof fetch };
        const first = await cacheCoverArt(handle.db, gameId, options);
        await rm(path.join(dataRoot, first.coverPath!), { force: true });
        const second = await cacheCoverArt(handle.db, gameId, options);
        expect(second.outcome).toBe("cached");
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
    it("refetches when the provider changed the artwork", async () => {
        addCandidate(COVER_URL);
        const fetchImpl = respondWith(png);
        const options = { dataRoot, now, lookupImpl: publicDns, fetchImpl: fetchImpl as unknown as typeof fetch };
        await cacheCoverArt(handle.db, gameId, options);
        handle.db.delete(metadataCandidates).run();
        addCandidate("https://images.igdb.com/igdb/image/upload/t_cover_big/other.jpg");
        const second = await cacheCoverArt(handle.db, gameId, options);
        expect(second.outcome).toBe("cached");
        expect(currentGame()?.coverSourceUrl).toContain("other.jpg");
    });
    it("skips a game with nothing applied, or no cover URL", async () => {
        const fetchImpl = respondWith(png);
        const options = { dataRoot, now, lookupImpl: publicDns, fetchImpl: fetchImpl as unknown as typeof fetch };
        expect((await cacheCoverArt(handle.db, gameId, options)).outcome).toBe("skipped");
        addCandidate(null);
        expect((await cacheCoverArt(handle.db, gameId, options)).outcome).toBe("skipped");
        expect(fetchImpl).not.toHaveBeenCalled();
    });
    it("refuses a cover URL outside the allow list", async () => {
        addCandidate("https://evil.example/cover.png");
        const fetchImpl = respondWith(png);
        const result = await cacheCoverArt(handle.db, gameId, {
            dataRoot, now, lookupImpl: publicDns,
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result.outcome).toBe("error");
        expect(result.message).toContain("allow list");
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(currentGame()?.coverPath).toBeNull();
    });
    it("reports a response that is not an image without touching the row", async () => {
        addCandidate(COVER_URL);
        const html = new TextEncoder().encode("<!DOCTYPE html><html></html>");
        const result = await cacheCoverArt(handle.db, gameId, {
            dataRoot, now, lookupImpl: publicDns,
            fetchImpl: respondWith(html) as unknown as typeof fetch,
        });
        expect(result.outcome).toBe("error");
        expect(currentGame()?.coverPath).toBeNull();
    });
    it("reports an HTTP failure", async () => {
        addCandidate(COVER_URL);
        const fetchImpl = vi.fn().mockResolvedValue(new Response("gone", { status: 404 }));
        const result = await cacheCoverArt(handle.db, gameId, {
            dataRoot, now, lookupImpl: publicDns,
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result.outcome).toBe("error");
        expect(result.message).toContain("404");
    });
    it("writes one file when two games share a cover", async () => {
        addCandidate(COVER_URL);
        const fetchImpl = respondWith(png);
        const options = { dataRoot, now, lookupImpl: publicDns, fetchImpl: fetchImpl as unknown as typeof fetch };
        const first = await cacheCoverArt(handle.db, gameId, options);
        const nes = handle.db.select().from(platforms).where(eq(platforms.slug, "nes")).get();
        const other = handle.db
            .insert(games)
            .values({
                platformId: nes!.id, slug: "other", title: "Other",
                sortTitle: "Other", filenameTitle: "Other",
            })
            .returning({ id: games.id })
            .get().id;
        handle.db
            .insert(metadataCandidates)
            .values({
                gameId: other, providerKey: "igdb", providerGameId: "9",
                score: 1, matchType: "title", platformSlug: "nes", title: "Other",
                metadataJson: { title: "Other", coverUrl: COVER_URL },
                reasonsJson: [], isSelected: true,
            })
            .run();
        const second = await cacheCoverArt(handle.db, other, options);
        expect(second.outcome).toBe("cached");
        expect(second.deduped).toBe(true);
        expect(second.coverPath).toBe(first.coverPath);
    });
});