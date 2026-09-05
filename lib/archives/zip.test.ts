import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeZip } from "../../tests/helpers/make-zip.ts";
import {
    ZipError,
    findSingleRomEntry,
    openZipEntry,
    readZipEntries,
} from "./zip.ts";
import { randomBytes } from "node:crypto";

let workspace = "";
const ROM = new TextEncoder().encode("NES\u001aROM PAYLOAD");

async function write(name: string, buffer: Buffer): Promise<string> {
    const file = path.join(workspace, name);
    await writeFile(file, buffer);
    return file;
}

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "saveslot-zip-"));
});

afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
});

describe("readZipEntries", () => {
    it("lists a stored entry", async () => {
        const file = await write(
            "stored.zip",
            makeZip([{ name: "Contra (USA).nes", content: ROM }]),
        );
        const entries = await readZipEntries(file);
        expect(entries).toHaveLength(1);
        expect(entries[0]?.name).toBe("Contra (USA).nes");
        expect(entries[0]?.method).toBe(0);
        expect(entries[0]?.uncompressedSize).toBe(ROM.length);
    });
    it("lists a deflated entry", async () => {
        const file = await write(
            "deflated.zip",
            makeZip([{ name: "Contra.nes", content: ROM, deflate: true }]),
        );
        const entries = await readZipEntries(file);
        expect(entries[0]?.method).toBe(8);
    });
    it("rejects a file that is not a zip", async () => {
        const file = await write("not.zip", Buffer.from("just some bytes here"));
        await expect(readZipEntries(file)).rejects.toBeInstanceOf(ZipError);
    });
    it("rejects an entry whose name escapes the archive", async () => {
        const file = await write(
            "slip.zip",
            makeZip([{ name: "../../etc/passwd", content: ROM }]),
        );
        await expect(readZipEntries(file)).rejects.toThrow(/unsafe path/i);
    });
    it("rejects an absolute entry name", async () => {
        const file = await write(
            "absolute.zip",
            makeZip([{ name: "/etc/passwd", content: ROM }]),
        );
        await expect(readZipEntries(file)).rejects.toThrow(/unsafe path/i);
    });
    it("rejects an implausible compression ratio", async () => {
        const file = await write(
            "bomb.zip",
            makeZip([
                {
                    name: "bomb.nes",
                    content: ROM,
                    deflate: true,
                    declaredUncompressedSize: 900 * 1024 * 1024,
                },
            ]),
        );
        await expect(readZipEntries(file)).rejects.toThrow(/ratio/i);
    });
    it("skips directory entries", async () => {
        const file = await write(
            "dirs.zip",
            makeZip([
                { name: "roms/", content: new Uint8Array() },
                { name: "roms/Contra.nes", content: ROM },
            ]),
        );
        const entries = await readZipEntries(file);
        expect(entries.map((entry) => entry.name)).toEqual(["roms/Contra.nes"]);
    });
});

describe("openZipEntry", () => {
    it("streams a stored entry byte for byte", async () => {
        const file = await write(
            "read-stored.zip",
            makeZip([{ name: "Contra.nes", content: ROM }]),
        );
        const [entry] = await readZipEntries(file);
        const bytes = await collect(await openZipEntry(file, entry!));
        expect(bytes).toEqual(Buffer.from(ROM));
    });
    it("inflates a deflated entry", async () => {
        const payload = new Uint8Array(randomBytes(50_000));
        const file = await write(
            "read-deflated.zip",
            makeZip([{ name: "Big.nes", content: payload, deflate: true }]),
        );
        const [entry] = await readZipEntries(file);
        const bytes = await collect(await openZipEntry(file, entry!));
        expect(bytes).toEqual(Buffer.from(payload));
    });
});

describe("findSingleRomEntry", () => {
    const extensions = [".nes", ".zip"];
    it("finds the one supported entry", async () => {
        const file = await write(
            "one-rom.zip",
            makeZip([
                { name: "readme.txt", content: ROM },
                { name: "Contra.nes", content: ROM },
            ]),
        );
        const entries = await readZipEntries(file);
        expect(findSingleRomEntry(entries, extensions)?.name).toBe("Contra.nes");
    });
    it("refuses to choose between two candidates", async () => {
        const file = await write(
            "two-roms.zip",
            makeZip([
                { name: "Contra.nes", content: ROM },
                { name: "Contra (Japan).nes", content: ROM },
            ]),
        );
        const entries = await readZipEntries(file);
        expect(findSingleRomEntry(entries, extensions)).toBeNull();
    });
    it("returns null when there is no supported entry", async () => {
        const file = await write(
            "no-rom.zip",
            makeZip([{ name: "readme.txt", content: ROM }]),
        );
        const entries = await readZipEntries(file);
        expect(findSingleRomEntry(entries, extensions)).toBeNull();
    });
});