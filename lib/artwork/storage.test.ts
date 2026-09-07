import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Derivative } from "./derive.ts";
import {
    ArtworkStorageError,
    artworkRelativePath,
    contentHash,
    resolveArtworkPath,
    storeDerivatives,
} from "./storage.ts";

let root = "";

function derivative(name: string, content: string, width = 264, height = 352): Derivative {
    return { name, width, height, bytes: new TextEncoder().encode(content) };
}

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "saveslot-artwork-"));
});
afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("artworkRelativePath", () => {
    it("fans out by the first two characters of the hash", () => {
        const hash = "a".repeat(64);
        expect(artworkRelativePath("thumb", hash)).toBe(`artwork/thumb/aa/${hash}.webp`);
    });

    it("refuses a name or hash that could escape", () => {
        expect(() => artworkRelativePath("../../etc", "a".repeat(64))).toThrow(ArtworkStorageError);
        expect(() => artworkRelativePath("thumb", "../../../etc/passwd")).toThrow(ArtworkStorageError);
        expect(() => artworkRelativePath("thumb", "not-a-hash")).toThrow(ArtworkStorageError);
    });
});

describe("storeDerivatives", () => {
    it("writes each derivative where its path says", async () => {
        const stored = await storeDerivatives(root, [
            derivative("thumb", "thumb-bytes"),
            derivative("cover", "cover-bytes", 600, 800),
        ]);

        expect(stored.map((entry) => entry.name)).toEqual(["thumb", "cover"]);
        for (const entry of stored) {
            expect(entry.deduped).toBe(false);
            const contents = await readFile(path.join(root, entry.relativePath), "utf8");
            expect(contents).toContain("-bytes");
        }
        expect(stored[1]?.width).toBe(600);
    });

    it("names files by content, so identical bytes share one file", async () => {
        const first = await storeDerivatives(root, [derivative("thumb", "same")]);
        const second = await storeDerivatives(root, [derivative("thumb", "same")]);

        expect(second[0]?.relativePath).toBe(first[0]?.relativePath);
        expect(second[0]?.deduped).toBe(true);

        const directory = path.join(root, path.dirname(first[0]!.relativePath));
        expect(await readdir(directory)).toHaveLength(1);
    });

    it("keeps different content apart", async () => {
        const [a] = await storeDerivatives(root, [derivative("thumb", "one")]);
        const [b] = await storeDerivatives(root, [derivative("thumb", "two")]);

        expect(a?.relativePath).not.toBe(b?.relativePath);
        expect(contentHash(new TextEncoder().encode("one")))
            .not.toBe(contentHash(new TextEncoder().encode("two")));
    });

    it("leaves no temporary files behind", async () => {
        const [entry] = await storeDerivatives(root, [derivative("thumb", "x")]);
        const directory = path.join(root, path.dirname(entry!.relativePath));

        expect((await readdir(directory)).some((name) => name.endsWith(".tmp"))).toBe(false);
    });
});

describe("resolveArtworkPath", () => {
    it("resolves a stored path", () => {
        const relative = artworkRelativePath("thumb", "b".repeat(64));
        expect(resolveArtworkPath(root, relative)).toBe(path.join(root, relative));
    });

    it("refuses a path outside the artwork directory", async () => {
        await writeFile(path.join(root, "app.sqlite"), "database");

        expect(() => resolveArtworkPath(root, "app.sqlite")).toThrow(ArtworkStorageError);
        expect(() => resolveArtworkPath(root, "artwork/../app.sqlite")).toThrow(ArtworkStorageError);
        expect(() => resolveArtworkPath(root, "../../etc/passwd")).toThrow(ArtworkStorageError);
    });
});