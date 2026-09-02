import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { games, platforms, saves } from "../../db/schema.ts";
import {
    createTestDatabase,
    seedTestPlatforms,
    type TestDatabaseHandle,
} from "../../tests/helpers/test-db.ts";
import {
    EmptySaveError,
    PayloadTooLargeError,
    currentSave,
    listSaves,
    storeSave,
    writeUploadToTemp,
} from "./storage.ts";

let handle: TestDatabaseHandle;
let dataRoot = "";
let gameId = 0;

async function* bytes(value: string): AsyncGenerator<Uint8Array> {
    yield new TextEncoder().encode(value);
}

async function upload(value: string, max = 1024) {
    return writeUploadToTemp(dataRoot, bytes(value), max);
}

async function store(value: string, extras: Record<string, unknown> = {}) {
    return storeSave({
        db: handle.db,
        dataRoot,
        gameId,
        coreKey: "snes9x",
        slot: "main",
        fileExtension: "srm",
        upload: await upload(value),
        source: "emulator",
        historyLimit: 3,
        ...extras,
    });
}

beforeEach(async () => {
    handle = createTestDatabase();
    seedTestPlatforms(handle.db);
    dataRoot = await mkdtemp(path.join(tmpdir(), "saveslot-saves-"));
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

describe("writeUploadToTemp", () => {
    it("hashes and sizes while streaming", async () => {
        const result = await upload("hello");
        expect(result.byteSize).toBe(5);
        expect(result.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
        await expect(stat(result.tempPath)).resolves.toBeDefined();
    });
    it("rejects a payload over the limit and leaves no temp file", async () => {
        await expect(upload("0123456789", 4)).rejects.toBeInstanceOf(
            PayloadTooLargeError,
        );
        expect(await readdir(path.join(dataRoot, "temp"))).toEqual([]);
    });
    it("rejects a zero-byte save", async () => {
        await expect(upload("")).rejects.toBeInstanceOf(EmptySaveError);
    });
});

describe("storeSave", () => {
    it("stores the first save as current", async () => {
        const result = await store("save-one");
        expect(result.status).toBe("stored");
        const current = currentSave(handle.db, gameId, "snes9x");
        expect(current?.isCurrent).toBe(true);
        expect(current?.byteSize).toBe(8);
        await expect(
            stat(path.resolve(dataRoot, current!.localRelativePath)),
        ).resolves.toBeDefined();
    });
    it("deduplicates identical bytes", async () => {
        const first = await store("same");
        const second = await store("same");
        expect(second.status).toBe("unchanged");
        expect(second.saveId).toBe(first.saveId);
        expect(handle.db.select().from(saves).all()).toHaveLength(1);
    });
    it("demotes the previous save to history", async () => {
        await store("first");
        await store("second");
        const all = listSaves(handle.db, gameId);
        expect(all).toHaveLength(2);
        expect(all.filter((row) => row.isCurrent)).toHaveLength(1);
        expect(currentSave(handle.db, gameId, "snes9x")?.byteSize).toBe(6);
    });

    it("keeps both versions on a conflict and does not promote", async () => {
        const first = await store("from-tab-one");
        const current = currentSave(handle.db, gameId, "snes9x");
        const result = await store("from-tab-two", {
            baseChecksum: "stale-checksum-from-launch",
        });
        expect(result.status).toBe("conflict");
        expect(handle.db.select().from(saves).all()).toHaveLength(2);
        expect(currentSave(handle.db, gameId, "snes9x")?.id).toBe(current?.id);
        expect(first.status).toBe("stored");
    });
    it("prunes history beyond the limit and deletes the files", async () => {
        for (const value of ["a", "bb", "ccc", "dddd", "eeeee", "ffffff"]) {
            await store(value);
        }
        const all = listSaves(handle.db, gameId);
        expect(all).toHaveLength(4);
        for (const row of all) {
            await expect(
                stat(path.resolve(dataRoot, row.localRelativePath)),
            ).resolves.toBeDefined();
        }
    });
    it("writes under the documented data layout", async () => {
        await store("layout");
        const current = currentSave(handle.db, gameId, "snes9x");
        expect(current?.localRelativePath).toMatch(
            new RegExp(`^saves/games/${gameId}/snes9x/main/.*\\.srm$`),
        );
    });
    it("leaves no temp files behind", async () => {
        await store("one");
        await store("two");
        await store("two");
        expect(await readdir(path.join(dataRoot, "temp"))).toEqual([]);
    });
});

describe("deleteSave", () => {
    it("removes a historical save and its file", async () => {
        await store("first");
        await store("second");
        const { deleteSave, getSave } = await import("./storage.ts");
        const history = listSaves(handle.db, gameId).find((row) => !row.isCurrent);
        const filePath = path.resolve(dataRoot, history!.localRelativePath);
        const result = await deleteSave(handle.db, dataRoot, history!.id);
        expect(result?.promotedId).toBeNull();
        expect(getSave(handle.db, history!.id)).toBeUndefined();
        await expect(stat(filePath)).rejects.toBeDefined();
        expect(listSaves(handle.db, gameId)).toHaveLength(1);
    });
    it("promotes the newest remaining save when the current one is deleted", async () => {
        await store("older");
        await store("newer");
        const { deleteSave } = await import("./storage.ts");
        const before = currentSave(handle.db, gameId, "snes9x");
        const older = listSaves(handle.db, gameId).find((row) => !row.isCurrent);
        const result = await deleteSave(handle.db, dataRoot, before!.id);
        expect(result?.promotedId).toBe(older!.id);
        expect(currentSave(handle.db, gameId, "snes9x")?.id).toBe(older!.id);
    });
    it("leaves no current save when the last one is deleted", async () => {
        await store("only");
        const { deleteSave } = await import("./storage.ts");
        const only = currentSave(handle.db, gameId, "snes9x");
        const result = await deleteSave(handle.db, dataRoot, only!.id);
        expect(result?.promotedId).toBeNull();
        expect(currentSave(handle.db, gameId, "snes9x")).toBeUndefined();
        expect(listSaves(handle.db, gameId)).toHaveLength(0);
    });
    it("returns null for an unknown id", async () => {
        const { deleteSave } = await import("./storage.ts");
        expect(await deleteSave(handle.db, dataRoot, 99999)).toBeNull();
    });
});