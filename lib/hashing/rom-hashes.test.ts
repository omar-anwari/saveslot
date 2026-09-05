import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeZip } from "../../tests/helpers/make-zip.ts";
import { hashFile } from "./file-hashes.ts";
import { hashRomFile } from "./rom-hashes.ts";

let workspace = "";
const EXTENSIONS = [".nes", ".zip"];
const ROM = new Uint8Array(randomBytes(4096));

async function write(name: string, data: Uint8Array | Buffer): Promise<string> {
    const file = path.join(workspace, name);
    await writeFile(file, data);
    return file;
}

beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "saveslot-romhash-"));
});

afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
});

describe("hashRomFile", () => {
    it("hashes a plain file directly", async () => {
        const file = await write("Contra.nes", ROM);
        const result = await hashRomFile(file, ".nes", EXTENSIONS);
        expect(result.hashedEntry).toBeNull();
        expect(result.warning).toBeNull();
        expect(result.hashes).toEqual(await hashFile(file));
    });
    it("hashes the ROM inside an archive, not the archive", async () => {
        const bare = await write("bare.nes", ROM);
        const archive = await write(
            "one.zip",
            makeZip([{ name: "Contra (USA).nes", content: ROM }]),
        );
        const inner = await hashRomFile(archive, ".zip", EXTENSIONS);
        const outer = await hashFile(archive);
        expect(inner.hashedEntry).toBe("Contra (USA).nes");
        expect(inner.hashes).toEqual(await hashFile(bare));
        expect(inner.hashes.sha1).not.toBe(outer.sha1);
    });
    it("gives the same hashes whether the entry is stored or deflated", async () => {
        const stored = await write(
            "stored.zip",
            makeZip([{ name: "Contra.nes", content: ROM }]),
        );
        const deflated = await write(
            "deflated.zip",
            makeZip([{ name: "Contra.nes", content: ROM, deflate: true }]),
        );
        const a = await hashRomFile(stored, ".zip", EXTENSIONS);
        const b = await hashRomFile(deflated, ".zip", EXTENSIONS);
        expect(a.hashes).toEqual(b.hashes);
    });
    it("falls back to the archive when there are two candidates", async () => {
        const archive = await write(
            "two.zip",
            makeZip([
                { name: "Contra (USA).nes", content: ROM },
                { name: "Contra (Japan).nes", content: ROM },
            ]),
        );
        const result = await hashRomFile(archive, ".zip", EXTENSIONS);
        expect(result.hashedEntry).toBeNull();
        expect(result.warning).toMatch(/exactly one/i);
        expect(result.hashes).toEqual(await hashFile(archive));
    });
    it("falls back when the archive holds no supported ROM", async () => {
        const archive = await write(
            "none.zip",
            makeZip([{ name: "readme.txt", content: ROM }]),
        );
        const result = await hashRomFile(archive, ".zip", EXTENSIONS);
        expect(result.hashedEntry).toBeNull();
        expect(result.warning).not.toBeNull();
    });
    it("falls back, with a reason, when the archive is malformed", async () => {
        const archive = await write("broken.zip", Buffer.from("not a zip at all"));
        const result = await hashRomFile(archive, ".zip", EXTENSIONS);
        expect(result.hashedEntry).toBeNull();
        expect(result.warning).toMatch(/hashed the archive itself/i);
        expect(result.hashes).toEqual(await hashFile(archive));
    });
    it("never throws on a hostile archive", async () => {
        const archive = await write(
            "slip.zip",
            makeZip([{ name: "../../etc/passwd", content: ROM }]),
        );
        const result = await hashRomFile(archive, ".zip", EXTENSIONS);
        expect(result.hashedEntry).toBeNull();
        expect(result.warning).toMatch(/unsafe path/i);
    });
});