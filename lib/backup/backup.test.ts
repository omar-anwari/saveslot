import Database from "better-sqlite3";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackupError, createBackup } from "./backup.ts";

let dataRoot = "";
let destination = "";
let databasePath = "";
let live: Database.Database;

const now = new Date("2026-09-07T12:34:56.789Z");

beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "saveslot-data-"));
    destination = await mkdtemp(path.join(tmpdir(), "saveslot-backups-"));
    databasePath = path.join(dataRoot, "app.sqlite");
    live = new Database(databasePath);
    live.pragma("journal_mode = WAL");
    live.exec("create table games (id integer primary key, title text)");
    live.prepare("insert into games (title) values (?)").run("Zelda II");
    await mkdir(path.join(dataRoot, "saves", "1"), { recursive: true });
    await writeFile(path.join(dataRoot, "saves", "1", "game.srm"), "SAVE-BYTES");
    await mkdir(path.join(dataRoot, "states"), { recursive: true });
    await writeFile(path.join(dataRoot, "states", "a.state"), "STATE");
    await mkdir(path.join(dataRoot, "artwork", "thumb"), { recursive: true });
    await writeFile(path.join(dataRoot, "artwork", "thumb", "a.webp"), "COVER");
});

afterEach(async () => {
    live.close();
    await rm(dataRoot, { recursive: true, force: true });
    await rm(destination, { recursive: true, force: true });
});

describe("createBackup", () => {
    it("captures rows that are still only in the WAL", async () => {
        live.prepare("insert into games (title) values (?)").run("Uncheckpointed");
        const result = await createBackup({ dataRoot, databasePath, destination, now });
        const copy = new Database(path.join(result.directory, "app.sqlite"), { readonly: true });
        const titles = copy.prepare("select title from games order by id").all() as { title: string }[];
        copy.close();
        expect(titles.map((row) => row.title)).toEqual(["Zelda II", "Uncheckpointed"]);
    });
    it("copies saves and states but not artwork by default", async () => {
        const result = await createBackup({ dataRoot, databasePath, destination, now });
        const byName = Object.fromEntries(result.trees.map((tree) => [tree.name, tree]));
        expect(byName.saves?.files).toBe(1);
        expect(byName.states?.files).toBe(1);
        expect(byName.artwork).toBeUndefined();
        expect(await readFile(path.join(result.directory, "saves", "1", "game.srm"), "utf8"))
            .toBe("SAVE-BYTES");
    });
    it("includes artwork when asked", async () => {
        const result = await createBackup({
            dataRoot, databasePath, destination, now, includeArtwork: true,
        });
        const artwork = result.trees.find((tree) => tree.name === "artwork");
        expect(artwork?.files).toBe(1);
        expect(artwork?.bytes).toBeGreaterThan(0);
    });
    it("writes a manifest that says what it left out", async () => {
        const result = await createBackup({ dataRoot, databasePath, destination, now });
        const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as {
            createdAt: string;
            includesArtwork: boolean;
            excludes: string[];
        };
        expect(manifest.createdAt).toBe(now.toISOString());
        expect(manifest.includesArtwork).toBe(false);
        expect(manifest.excludes).toContain(".env.local");
    });
    it("names the directory by timestamp", async () => {
        const result = await createBackup({ dataRoot, databasePath, destination, now });
        expect(path.basename(result.directory)).toBe("saveslot-backup-2026-09-07T12-34-56-789Z");
    });
    it("refuses to overwrite an existing backup", async () => {
        await createBackup({ dataRoot, databasePath, destination, now });
        await expect(createBackup({ dataRoot, databasePath, destination, now }))
            .rejects.toBeInstanceOf(BackupError);
    });
    it("survives a data directory with nothing in it", async () => {
        const empty = await mkdtemp(path.join(tmpdir(), "saveslot-empty-"));
        const emptyDb = path.join(empty, "app.sqlite");
        new Database(emptyDb).close();
        const result = await createBackup({ dataRoot: empty, databasePath: emptyDb, destination, now });
        expect(result.trees.every((tree) => tree.files === 0)).toBe(true);
        await rm(empty, { recursive: true, force: true });
    });
});