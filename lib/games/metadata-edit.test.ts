import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { games, metadataCandidates, platforms } from "../../db/schema.ts";
import {
    createTestDatabase,
    seedTestPlatforms,
    type TestDatabaseHandle,
} from "../../tests/helpers/test-db.ts";
import {
    revertFields,
    selectCandidate,
    updateManualMetadata,
} from "./metadata-edit.ts";

let handle: TestDatabaseHandle;
let gameId = 0;
const now = new Date("2026-09-07T12:00:00Z");

function metadata(overrides: Record<string, unknown> = {}) {
    return {
        title: "The Legend of Zelda: A Link to the Past",
        sortTitle: null,
        summary: "A provider summary.",
        releaseYear: 1991,
        developer: "Nintendo EAD",
        publisher: "St. GIGA",
        genres: ["Puzzle", "Adventure"],
        regions: ["EU"],
        languages: ["en"],
        players: 1,
        rating: 96,
        platformSlugs: ["snes"],
        coverUrl: null,
        externalIds: [],
        ...overrides,
    };
}

function addCandidate(providerGameId: string, selected: boolean, overrides = {}) {
    handle.db
        .insert(metadataCandidates)
        .values({
            gameId,
            providerKey: "igdb",
            providerGameId,
            score: 0.9,
            matchType: "title",
            platformSlug: "snes",
            title: "A Link to the Past",
            metadataJson: metadata(overrides),
            reasonsJson: [],
            isSelected: selected,
        })
        .run();
}

function currentGame() {
    return handle.db.select().from(games).where(eq(games.id, gameId)).get();
}

beforeEach(() => {
    handle = createTestDatabase();
    seedTestPlatforms(handle.db);
    const snes = handle.db.select().from(platforms).where(eq(platforms.slug, "snes")).get();
    gameId = handle.db
        .insert(games)
        .values({
            platformId: snes!.id,
            slug: "alttp",
            title: "The Legend of Zelda: A Link to the Past",
            sortTitle: "Legend of Zelda",
            filenameTitle: "Legend of Zelda, The - A Link to the Past (axekin.com)",
            publisher: "St. GIGA",
        })
        .returning({ id: games.id })
        .get().id;
});

afterEach(() => {
    handle.close();
});

describe("updateManualMetadata", () => {
    it("writes a field and locks it", () => {
        const result = updateManualMetadata(handle.db, gameId, { publisher: "Nintendo" }, now);
        expect(result?.changed).toEqual(["publisher"]);
        const game = currentGame();
        expect(game?.publisher).toBe("Nintendo");
        expect(game?.manualFieldsJson).toEqual({ publisher: true });
        expect(game?.metadataStatus).toBe("manual");
    });

    it("accumulates locks across edits", () => {
        updateManualMetadata(handle.db, gameId, { publisher: "Nintendo" }, now);
        updateManualMetadata(handle.db, gameId, { releaseYear: 1992 }, now);
        expect(currentGame()?.manualFieldsJson).toEqual({ publisher: true, releaseYear: true });
    });
    it("handles genres and nullable fields", () => {
        updateManualMetadata(handle.db, gameId, { genres: ["Action"], summary: null }, now);
        const game = currentGame();
        expect(game?.genresJson).toEqual(["Action"]);
        expect(game?.summary).toBeNull();
    });
    it("changes nothing when given nothing", () => {
        const result = updateManualMetadata(handle.db, gameId, {}, now);
        expect(result?.changed).toEqual([]);
        expect(currentGame()?.metadataStatus).toBe("unmatched");
    });
    it("returns null for a game that does not exist", () => {
        expect(updateManualMetadata(handle.db, 9999, { publisher: "x" }, now)).toBeNull();
    });
});

describe("revertFields", () => {
    it("puts back the provider value and unlocks", () => {
        addCandidate("1030", true);
        updateManualMetadata(handle.db, gameId, { publisher: "Nintendo" }, now);
        const result = revertFields(handle.db, gameId, ["publisher"], now);
        expect(result?.locked).toEqual([]);
        const game = currentGame();
        expect(game?.publisher).toBe("St. GIGA");
        expect(game?.manualFieldsJson).toEqual({});
        expect(game?.metadataStatus).toBe("matched");
    });
    it("falls back to the filename for the title", () => {
        updateManualMetadata(handle.db, gameId, { title: "My Title" }, now);
        revertFields(handle.db, gameId, ["title"], now);
        expect(currentGame()?.title).toBe("Legend of Zelda, The - A Link to the Past (axekin.com)");
    });
    it("keeps other locks in place", () => {
        addCandidate("1030", true);
        updateManualMetadata(handle.db, gameId, { publisher: "Nintendo", releaseYear: 1992 }, now);
        revertFields(handle.db, gameId, ["publisher"], now);
        const game = currentGame();
        expect(game?.manualFieldsJson).toEqual({ releaseYear: true });
        expect(game?.releaseYear).toBe(1992);
        expect(game?.metadataStatus).toBe("manual");
    });
    it("joins provider lists for the single-value columns", () => {
        addCandidate("1030", true, { regions: ["EU", "US"], languages: ["en", "fr"] });
        updateManualMetadata(handle.db, gameId, { region: "JP" }, now);
        revertFields(handle.db, gameId, ["region", "language"], now);
        const game = currentGame();
        expect(game?.region).toBe("EU, US");
        expect(game?.language).toBe("en, fr");
    });
});

describe("selectCandidate", () => {
    it("switches the selection and applies it", () => {
        addCandidate("1030", true);
        addCandidate("2222", false, { title: "A Different Game", publisher: "Someone Else" });
        const result = selectCandidate(handle.db, gameId, "igdb", "2222", now);
        expect(result?.title).toBe("A Different Game");
        expect(currentGame()?.title).toBe("A Different Game");
        expect(currentGame()?.metadataProviderId).toBe("2222");
        const rows = handle.db.select().from(metadataCandidates).all();
        expect(rows.filter((row) => row.isSelected)).toHaveLength(1);
        expect(rows.find((row) => row.isSelected)?.providerGameId).toBe("2222");
    });
    it("does not overwrite a locked field", () => {
        addCandidate("1030", true);
        updateManualMetadata(handle.db, gameId, { publisher: "Nintendo" }, now);
        addCandidate("2222", false, { title: "Other", publisher: "Someone Else" });
        selectCandidate(handle.db, gameId, "igdb", "2222", now);
        const game = currentGame();
        expect(game?.title).toBe("Other");
        expect(game?.publisher).toBe("Nintendo");
    });
    it("returns null for a candidate this game does not have", () => {
        addCandidate("1030", true);
        expect(selectCandidate(handle.db, gameId, "igdb", "nope", now)).toBeNull();
    });
});