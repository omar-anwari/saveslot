import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFileResponse } from "./file-response.ts";

let workspace = "";
let romPath = "";
const CONTENT = "0123456789ABCDEF";
const MODIFIED = new Date("2026-01-02T03:04:05Z");

function build(overrides: Partial<Parameters<typeof buildFileResponse>[0]> = {}) {
    return buildFileResponse({
        absolutePath: romPath,
        size: CONTENT.length,
        modifiedAt: MODIFIED,
        downloadName: "Contra (USA).nes",
        method: "GET",
        rangeHeader: null,
        ifNoneMatch: null,
        ...overrides,
    });
}

beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "saveslot-stream-"));
    romPath = path.join(workspace, "rom.nes");
    await writeFile(romPath, CONTENT);
});
afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
});
describe("buildFileResponse", () => {
    it("streams the whole file with a restrictive content type", async () => {
        const response = build();
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/octet-stream");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("accept-ranges")).toBe("bytes");
        expect(response.headers.get("content-length")).toBe("16");
        expect(await response.text()).toBe(CONTENT);
    });
    it("serves a byte range as 206 with the right slice", async () => {
        const response = build({ rangeHeader: "bytes=4-7" });
        expect(response.status).toBe(206);
        expect(response.headers.get("content-range")).toBe("bytes 4-7/16");
        expect(response.headers.get("content-length")).toBe("4");
        expect(await response.text()).toBe("4567");
    });
    it("serves a suffix range", async () => {
        const response = build({ rangeHeader: "bytes=-3" });
        expect(response.status).toBe(206);
        expect(await response.text()).toBe("DEF");
    });
    it("returns 416 for an impossible range", async () => {
        const response = build({ rangeHeader: "bytes=999-" });
        expect(response.status).toBe(416);
        expect(response.headers.get("content-range")).toBe("bytes */16");
    });
    it("answers HEAD with headers and no body", async () => {
        const response = build({ method: "HEAD" });
        expect(response.status).toBe(200);
        expect(response.headers.get("content-length")).toBe("16");
        expect(await response.text()).toBe("");
    });
    it("returns 304 when the etag matches", async () => {
        const etag = build().headers.get("etag");
        expect(etag).not.toBeNull();
        const response = build({ ifNoneMatch: etag });
        expect(response.status).toBe(304);
    });
    it("keeps the filename in the header and encodes non-ascii", () => {
        const response = build({ downloadName: "Pokémon Crystal.gbc" });
        const disposition = response.headers.get("content-disposition") ?? "";
        expect(disposition).toContain('filename="Pok_mon Crystal.gbc"');
        expect(disposition).toContain("filename*=UTF-8''Pok%C3%A9mon%20Crystal.gbc");
    });
    it("strips characters that could inject a header", () => {
        const response = build({
            downloadName: 'evil\r\nX-Injected: yes"\\.nes',
        });
        const disposition = response.headers.get("content-disposition") ?? "";
        expect(disposition).not.toMatch(/[\r\n]/);
        expect(disposition.split('"')).toHaveLength(3);
        expect(response.headers.get("x-injected")).toBeNull();
    });
});