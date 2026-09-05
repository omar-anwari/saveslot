import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_MAGIC, fixtureContent, isFixtureFile } from "./fixtures.ts";

let workspace = "";

beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "saveslot-fixtures-"));
    await writeFile(path.join(workspace, "fake.nes"), fixtureContent("Test"));
    await writeFile(path.join(workspace, "real.nes"), Buffer.from("NES\u001a rest"));
    await writeFile(path.join(workspace, "tiny.nes"), "hi");
});

afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
});

describe("isFixtureFile", () => {
    it("recognises a generated fixture", async () => {
        expect(await isFixtureFile(path.join(workspace, "fake.nes"))).toBe(true);
    });
    it("does not flag a real ROM", async () => {
        expect(await isFixtureFile(path.join(workspace, "real.nes"))).toBe(false);
    });
    it("handles a file shorter than the marker", async () => {
        expect(await isFixtureFile(path.join(workspace, "tiny.nes"))).toBe(false);
    });
    it("returns false for a missing file", async () => {
        expect(await isFixtureFile(path.join(workspace, "nope.nes"))).toBe(false);
    });
});

describe("fixtureContent", () => {
    it("starts with the marker and states it is not playable", () => {
        const text = new TextDecoder().decode(fixtureContent("Contra").slice(0, 120));
        expect(text.startsWith(FIXTURE_MAGIC)).toBe(true);
        expect(text).toContain("not a playable ROM");
    });
    it("is deterministic, so checksums are stable", () => {
        expect(fixtureContent("Contra")).toEqual(fixtureContent("Contra"));
    });
    it("pads to the requested size", () => {
        expect(fixtureContent("x", 4096)).toHaveLength(4096);
    });
});