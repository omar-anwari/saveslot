import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { games, platforms } from "../../db/schema.ts";
import {
    createTestDatabase,
    seedTestPlatforms,
    type TestDatabaseHandle,
} from "../../tests/helpers/test-db.ts";
import {
    deleteSaveState,
    getSaveState,
    listStates,
    storeState,
    updateSaveState,
} from "./states.ts";
import { writeUploadToTemp } from "./storage.ts";

let handle: TestDatabaseHandle;
let dataRoot = "";
let gameId = 0;

async function* bytes(value: string): AsyncGenerator<Uint8Array> {
    yield new TextEncoder().encode(value);
}

async function store(value: string, extras: Record<string, unknown> = {}) {
    return storeState({
        db: handle.db,
        dataRoot,
        gameId,
        coreKey: "snes9x",
        upload: await writeUploadToTemp(dataRoot, bytes(value), 1024 * 1024),
        manualLimit: 3,
        autosaveLimit: 1,
        ...extras,
    });
}

beforeEach(async () => {
    handle = createTestDatabase();
    seedTestPlatforms(handle.db);
    dataRoot = await mkdtemp(path.join(tmpdir(), "saveslot-states-"));
    const platform = handle.db
        .select({ id: platforms.id })
        .from(platforms)
        .where(eq(platforms.slug, "snes"))
        .get();
    gameId = handle.db
        .insert(games)
        .values({
            platformId: platform!.id,
            slug: "snes-test",
            title: "Test",
            sortTitle: "test",
            filenameTitle: "Test",
        })
        .returning({ id: games.id })
        .get().id;
});

afterEach(async () => {
    handle.close();
    await rm(dataRoot, { recursive: true, force: true });
});

describe("storeState", () => {
    it("stores a state with a generated label", async () => {
        const id = await store("state-bytes");
        const state = getSaveState(handle.db, id);
        expect(state?.coreKey).toBe("snes9x");
        expect(state?.byteSize).toBe("state-bytes".length); expect(state?.isAutosave).toBe(false);
        expect(state?.label).toMatch(
            /^[A-Z][a-z]{2} \d{1,2}, \d{4} · \d{1,2}:\d{2} (AM|PM)$/,
        );
        await expect(
            stat(path.resolve(dataRoot, state!.localRelativePath)),
        ).resolves.toBeDefined();
    });
    it("uses a UUID id, not a sequential one", async () => {
        const id = await store("x");
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });
    it("writes under the documented layout", async () => {
        const id = await store("x");
        const state = getSaveState(handle.db, id);
        expect(state?.localRelativePath).toBe(
            `states/games/${gameId}/snes9x/${id}.state`,
        );
    });
    it("stores an optional screenshot alongside", async () => {
        const id = await store("x", {
            screenshot: await writeUploadToTemp(dataRoot, bytes("png"), 1024),
        });
        const state = getSaveState(handle.db, id);
        expect(state?.screenshotRelativePath).toBe(
            `states/games/${gameId}/snes9x/${id}.png`,
        );
        await expect(
            stat(path.resolve(dataRoot, state!.screenshotRelativePath!)),
        ).resolves.toBeDefined();
    });
    it("keeps a custom label", async () => {
        const id = await store("x", { label: "Before the boss" });
        expect(getSaveState(handle.db, id)?.label).toBe("Before the boss");
    });
    it("prunes manual states to the manual limit", async () => {
        for (const value of ["a", "bb", "ccc", "dddd", "eeeee"]) {
            await store(value);
        }
        expect(listStates(handle.db, gameId, "snes9x")).toHaveLength(3);
    });
    it("prunes autosaves harder, and separately from manual states", async () => {
        await store("manual-one");
        await store("manual-two");
        await store("auto-one", { isAutosave: true });
        await store("auto-two", { isAutosave: true });
        const all = listStates(handle.db, gameId, "snes9x");
        expect(all.filter((row) => row.isAutosave)).toHaveLength(1);
        expect(all.filter((row) => !row.isAutosave)).toHaveLength(2);
    });
    it("does not list states belonging to another core", async () => {
        await store("snes-state");
        await store("gb-state", { coreKey: "gambatte" });

        expect(listStates(handle.db, gameId, "snes9x")).toHaveLength(1);
        expect(listStates(handle.db, gameId)).toHaveLength(2);
    });
    it("records the core version when supplied", async () => {
        const id = await store("x", { coreVersion: "1.62.3" });
        expect(getSaveState(handle.db, id)?.coreVersion).toBe("1.62.3");
    });
});

describe("updateSaveState", () => {
    it("renames a state", async () => {
        const id = await store("x");
        const updated = updateSaveState(handle.db, id, { label: "Renamed" });
        expect(updated?.label).toBe("Renamed");
    });
    it("returns null for an unknown id", () => {
        expect(updateSaveState(handle.db, "nope", { label: "x" })).toBeNull();
    });
});

describe("deleteSaveState", () => {
    it("removes the row, the state file and its screenshot", async () => {
        const id = await store("x", {
            screenshot: await writeUploadToTemp(dataRoot, bytes("png"), 1024),
        });
        const state = getSaveState(handle.db, id);
        const statePath = path.resolve(dataRoot, state!.localRelativePath);
        const shotPath = path.resolve(dataRoot, state!.screenshotRelativePath!);
        expect(await deleteSaveState(handle.db, dataRoot, id)).toBe(true);
        expect(getSaveState(handle.db, id)).toBeUndefined();
        await expect(stat(statePath)).rejects.toBeDefined();
        await expect(stat(shotPath)).rejects.toBeDefined();
    });
    it("returns false for an unknown id", async () => {
        expect(await deleteSaveState(handle.db, dataRoot, "nope")).toBe(false);
    });
});