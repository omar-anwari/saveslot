import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gameFiles, games, scanRuns } from "../../db/schema.ts";
import {
    createTestDatabase,
    seedTestPlatforms,
    type TestDatabaseHandle,
} from "../../tests/helpers/test-db.ts";
import { releaseScanLock } from "./scan-lock.ts";
import { runScan } from "./scan-service.ts";

let handle: TestDatabaseHandle;
let root = "";
let workspace = "";

beforeEach(async () => {
    handle = createTestDatabase();
    seedTestPlatforms(handle.db);
    releaseScanLock();
    workspace = await mkdtemp(path.join(tmpdir(), "saveslot-scan-"));
    root = path.join(workspace, "library");
    await mkdir(path.join(root, "nes"), { recursive: true });
    await mkdir(path.join(root, "snes"), { recursive: true });
    await writeFile(path.join(root, "nes", "Contra (USA).nes"), "rom");
    await writeFile(path.join(root, "snes", "Chrono Trigger (USA).sfc"), "rom");
});

afterEach(async () => {
    releaseScanLock();
    handle.close();
    await rm(workspace, { recursive: true, force: true });
});

describe("runScan", () => {
    it("adds discovered files as games", async () => {
        const result = await runScan(handle.db, { libraryRoot: root, mode: "quick" });
        expect(result.counters.discovered).toBe(2);
        expect(result.counters.added).toBe(2);
        expect(handle.db.select().from(games).all()).toHaveLength(2);
        expect(handle.db.select().from(gameFiles).all()).toHaveLength(2);
    });
    it("derives titles and tags from the filename", async () => {
        await runScan(handle.db, { libraryRoot: root, mode: "quick" });
        const contra = handle.db
            .select()
            .from(games)
            .where(eq(games.title, "Contra"))
            .get();
        expect(contra?.region).toBe("USA");
        expect(contra?.sortTitle).toBe("contra");
        expect(contra?.metadataStatus).toBe("unmatched");
        expect(contra?.slug).toBe("nes-contra");
    });
    it("is idempotent: a second scan adds nothing", async () => {
        await runScan(handle.db, { libraryRoot: root, mode: "quick" });
        const second = await runScan(handle.db, {
            libraryRoot: root,
            mode: "quick",
        });
        expect(second.counters.added).toBe(0);
        expect(second.counters.updated).toBe(0);
        expect(second.counters.discovered).toBe(2);
        expect(handle.db.select().from(games).all()).toHaveLength(2);
    });
    it("marks a removed file absent without deleting its game", async () => {
        await runScan(handle.db, { libraryRoot: root, mode: "quick" });
        await rm(path.join(root, "nes", "Contra (USA).nes"));
        const result = await runScan(handle.db, {
            libraryRoot: root,
            mode: "quick",
        });
        expect(result.counters.missing).toBe(1);
        expect(handle.db.select().from(games).all()).toHaveLength(2);
        const file = handle.db
            .select()
            .from(gameFiles)
            .where(eq(gameFiles.fileName, "Contra (USA).nes"))
            .get();
        expect(file?.present).toBe(false);
    });
    it("restores a file that reappears", async () => {
        await runScan(handle.db, { libraryRoot: root, mode: "quick" });
        const romPath = path.join(root, "nes", "Contra (USA).nes");
        await rm(romPath);
        await runScan(handle.db, { libraryRoot: root, mode: "quick" });
        await writeFile(romPath, "rom");
        const result = await runScan(handle.db, {
            libraryRoot: root,
            mode: "quick",
        });
        expect(result.counters.updated).toBe(1);
        const file = handle.db
            .select()
            .from(gameFiles)
            .where(eq(gameFiles.fileName, "Contra (USA).nes"))
            .get();
        expect(file?.present).toBe(true);
    });
    it("clears stored hashes when a file changes on disk", async () => {
        await runScan(handle.db, { libraryRoot: root, mode: "quick" });
        handle.db
            .update(gameFiles)
            .set({ crc32: "deadbeef" })
            .where(eq(gameFiles.fileName, "Contra (USA).nes"))
            .run();
        const romPath = path.join(root, "nes", "Contra (USA).nes");
        await writeFile(romPath, "different content");
        const future = new Date(Date.now() + 5000);
        await utimes(romPath, future, future);
        await runScan(handle.db, { libraryRoot: root, mode: "quick" });
        const file = handle.db
            .select()
            .from(gameFiles)
            .where(eq(gameFiles.fileName, "Contra (USA).nes"))
            .get();
        expect(file?.crc32).toBeNull();
    });
    it("can be scoped to one platform", async () => {
        const result = await runScan(handle.db, {
            libraryRoot: root,
            mode: "quick",
            platformSlug: "snes",
        });
        expect(result.counters.discovered).toBe(1);
        expect(handle.db.select().from(games).all()).toHaveLength(1);
    });
    it("records a completed run with counters", async () => {
        const result = await runScan(handle.db, { libraryRoot: root, mode: "quick" });
        const run = handle.db
            .select()
            .from(scanRuns)
            .where(eq(scanRuns.id, result.scanRunId))
            .get();
        expect(run?.status).toBe("completed");
        expect(run?.discoveredCount).toBe(2);
        expect(run?.completedAt).toBeInstanceOf(Date);
    });
    it("releases the lock so a later scan can run", async () => {
        await runScan(handle.db, { libraryRoot: root, mode: "quick" });
        await expect(
            runScan(handle.db, { libraryRoot: root, mode: "quick" }),
        ).resolves.toBeDefined();
    });
});