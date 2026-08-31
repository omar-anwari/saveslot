import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Crc32, hashFile } from "./file-hashes.ts";

let workspace = "";
const largeContent = randomBytes(3 * 1024 * 1024);

beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "saveslot-hash-"));
    await writeFile(path.join(workspace, "check.bin"), "123456789");
    await writeFile(path.join(workspace, "empty.bin"), "");
    await writeFile(path.join(workspace, "large.bin"), largeContent);
});

afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
});

describe("Crc32", () => {
    it("produces the standard CRC-32/ISO-HDLC check value", () => {
        const crc = new Crc32();
        crc.update(Buffer.from("123456789"));
        expect(crc.digest()).toBe("cbf43926");
    });
    it("produces 00000000 for no input", () => {
        expect(new Crc32().digest()).toBe("00000000");
    });
    it("is unaffected by how input is chunked", () => {
        const whole = new Crc32();
        whole.update(Buffer.from("hello world"));

        const split = new Crc32();
        split.update(Buffer.from("hello "));
        split.update(Buffer.from("world"));
        expect(split.digest()).toBe(whole.digest());
    });
});

describe("hashFile", () => {
    it("matches one-shot digests for a multi-chunk file", async () => {
        const result = await hashFile(path.join(workspace, "large.bin"));
        expect(result.md5).toBe(createHash("md5").update(largeContent).digest("hex"));
        expect(result.sha1).toBe(
            createHash("sha1").update(largeContent).digest("hex"),
        );
    });
    it("computes only the requested algorithms", async () => {
        const result = await hashFile(path.join(workspace, "check.bin"), ["crc32"]);
        expect(result.crc32).toBe("cbf43926");
        expect(result.md5).toBeNull();
        expect(result.sha1).toBeNull();
    });
    it("handles an empty file", async () => {
        const result = await hashFile(path.join(workspace, "empty.bin"));
        expect(result.crc32).toBe("00000000");
        expect(result.md5).toBe(createHash("md5").digest("hex"));
    });
    it("returns lowercase hex digests", async () => {
        const result = await hashFile(path.join(workspace, "check.bin"));
        expect(result.sha1).toMatch(/^[0-9a-f]{40}$/);
        expect(result.md5).toMatch(/^[0-9a-f]{32}$/);
        expect(result.crc32).toMatch(/^[0-9a-f]{8}$/);
    });
});