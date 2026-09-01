import { eq } from "drizzle-orm";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { gameFiles, games, platforms } from "../../db/schema.ts";
import {
    createTestDatabase,
    seedTestPlatforms,
    type TestDatabaseHandle,
} from "../../tests/helpers/test-db.ts";
import { queryGames, getGameDetail } from "./query.ts";

let handle: TestDatabaseHandle;

function platformId(slug: string): number {
    const row = handle.db
        .select({ id: platforms.id })
        .from(platforms)
        .where(eq(platforms.slug, slug))
        .get();
    if (!row) throw new Error(`missing platform ${slug}`);
    return row.id;
}

function addGame(options: {
    slug: string;
    title: string;
    sortTitle: string;
    platform: string;
    year?: number;
    favourite?: boolean;
    hidden?: boolean;
    present?: boolean;
}): void {
    const inserted = handle.db
        .insert(games)
        .values({
            platformId: platformId(options.platform),
            slug: options.slug,
            title: options.title,
            sortTitle: options.sortTitle,
            filenameTitle: options.title,
            releaseYear: options.year ?? null,
            favourite: options.favourite ?? false,
            hidden: options.hidden ?? false,
        })
        .returning({ id: games.id })
        .get();
    handle.db
        .insert(gameFiles)
        .values({
            gameId: inserted.id,
            relativePath: `${options.platform}/${options.slug}.rom`,
            fileName: `${options.slug}.rom`,
            extension: ".rom",
            sizeBytes: 4,
            modifiedAtFs: new Date(),
            present: options.present ?? true,
        })
        .run();
}

beforeEach(() => {
    handle = createTestDatabase();
    seedTestPlatforms(handle.db);
    addGame({ slug: "a", title: "Contra", sortTitle: "contra", platform: "nes", year: 1988 });
    addGame({ slug: "b", title: "The Legend of Zelda", sortTitle: "legend of zelda", platform: "nes", year: 1986, favourite: true });
    addGame({ slug: "c", title: "Chrono Trigger", sortTitle: "chrono trigger", platform: "snes", year: 1995 });
    addGame({ slug: "d", title: "Secret Game", sortTitle: "secret game", platform: "snes", hidden: true });
    addGame({ slug: "e", title: "Gone Away", sortTitle: "gone away", platform: "gb", present: false });
});

afterEach(() => {
    handle.close();
});

describe("queryGames", () => {
    it("excludes hidden games by default", () => {
        const result = queryGames(handle.db);
        expect(result.games.map((g) => g.slug)).not.toContain("d");
        expect(result.total).toBe(4);
    });
    it("includes hidden games when asked", () => {
        const result = queryGames(handle.db, { includeHidden: true });
        expect(result.total).toBe(5);
    });
    it("sorts by sortTitle, ignoring leading articles", () => {
        const result = queryGames(handle.db, { sort: "title" });
        expect(result.games.map((g) => g.title)).toEqual([
            "Chrono Trigger",
            "Contra",
            "Gone Away",
            "The Legend of Zelda",
        ]);
    });
    it("filters by platform", () => {
        const result = queryGames(handle.db, { platform: "nes" });
        expect(result.total).toBe(2);
    });
    it("filters by favourite", () => {
        const result = queryGames(handle.db, { favourite: true });
        expect(result.games).toHaveLength(1);
        expect(result.games[0]?.title).toBe("The Legend of Zelda");
    });
    it("filters by release year", () => {
        expect(queryGames(handle.db, { year: 1995 }).total).toBe(1);
    });
    it("reports presence from the underlying files", () => {
        const missing = queryGames(handle.db, { present: false });
        expect(missing.games.map((g) => g.slug)).toEqual(["e"]);
        const present = queryGames(handle.db, { present: true });
        expect(present.total).toBe(3);
    });
    it("searches case-insensitively", () => {
        const result = queryGames(handle.db, { q: "ZELDA" });
        expect(result.games.map((g) => g.title)).toEqual(["The Legend of Zelda"]);
    });
    it("treats LIKE wildcards in the search term literally", () => {
        expect(queryGames(handle.db, { q: "%" }).total).toBe(0);
    });
    it("paginates deterministically", () => {
        const first = queryGames(handle.db, { pageSize: 2, page: 1 });
        const second = queryGames(handle.db, { pageSize: 2, page: 2 });
        expect(first.games).toHaveLength(2);
        expect(second.games).toHaveLength(2);
        expect(first.pageCount).toBe(2);
        expect(first.total).toBe(4);
        const slugs = [...first.games, ...second.games].map((g) => g.slug);
        expect(new Set(slugs).size).toBe(4);
    });

    it("caps the page size", () => {
        expect(queryGames(handle.db, { pageSize: 100000 }).pageSize).toBe(100);
    });

    it("includes platform names for display", () => {
        const result = queryGames(handle.db, { platform: "snes", sort: "title" });
        expect(result.games[0]?.platformName).toBe(
            "Super Nintendo Entertainment System",
        );
    });
});

describe("updateGame", () => {
    it("sets favourite and returns the updated game", async () => {
        const { updateGame } = await import("./mutations.ts");
        const before = getGameDetail(handle.db, "a");
        expect(before?.favourite).toBe(false);
        const after = updateGame(handle.db, "a", { favourite: true });
        expect(after?.favourite).toBe(true);
        expect(getGameDetail(handle.db, "a")?.favourite).toBe(true);
    });
    it("is idempotent", async () => {
        const { updateGame } = await import("./mutations.ts");
        updateGame(handle.db, "a", { favourite: true });
        updateGame(handle.db, "a", { favourite: true });
        expect(getGameDetail(handle.db, "a")?.favourite).toBe(true);
    });
    it("updates play status", async () => {
        const { updateGame } = await import("./mutations.ts");
        const updated = updateGame(handle.db, "a", { playStatus: "completed" });
        expect(updated?.playStatus).toBe("completed");
    });
    it("hides a game so the default listing excludes it", async () => {
        const { updateGame } = await import("./mutations.ts");
        updateGame(handle.db, "a", { hidden: true });
        expect(queryGames(handle.db).games.map((g) => g.slug)).not.toContain("a");
        expect(queryGames(handle.db, { includeHidden: true }).total).toBe(5);
    });
    it("returns null for an unknown slug", async () => {
        const { updateGame } = await import("./mutations.ts");
        expect(updateGame(handle.db, "nope", { favourite: true })).toBeNull();
    });
    it("leaves other fields untouched", async () => {
        const { updateGame } = await import("./mutations.ts");
        const before = getGameDetail(handle.db, "b");
        const after = updateGame(handle.db, "b", { playStatus: "playing" });
        expect(after?.favourite).toBe(before?.favourite);
        expect(after?.title).toBe(before?.title);
    });
});