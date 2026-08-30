import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    PathEscapeError,
    isWithinRoot,
    resolveRealPathWithinRoot,
    resolveWithinRoot,
    toPosixRelative,
} from "./paths";

let workspace = "";
let root = "";
let outside = "";

beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "saveslot-paths-"));
    root = path.join(workspace, "library");
    outside = path.join(workspace, "secrets");

    await mkdir(path.join(root, "nes"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(root, "nes", "game.nes"), "rom");
    await writeFile(path.join(outside, "private.txt"), "secret");
    await symlink(
        path.join(outside, "private.txt"),
        path.join(root, "nes", "escape.nes"),
    );
});

afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
});

describe("resolveWithinRoot", () => {
    it("accepts a normal nested path", () => {
        expect(resolveWithinRoot(root, "nes/game.nes")).toBe(
            path.join(root, "nes", "game.nes"),
        );
    });
    it("accepts a traversal that stays inside the root", () => {
        expect(resolveWithinRoot(root, "nes/../nes/game.nes")).toBe(
            path.join(root, "nes", "game.nes"),
        );
    });
    it("rejects parent traversal", () => {
        expect(() => resolveWithinRoot(root, "../secrets/private.txt")).toThrow(
            PathEscapeError,
        );
    });
    it("rejects deep traversal", () => {
        expect(() => resolveWithinRoot(root,
            "nes/../../secrets/private.txt")).toThrow(
                PathEscapeError,
            );
    });
    it("rejects absolute paths", () => {
        expect(() => resolveWithinRoot(root, "/etc/passwd")).toThrow(PathEscapeError);
    });
    it("rejects null bytes", () => {
        expect(() => resolveWithinRoot(root, "nes/game.nes\0.png")).toThrow(
            PathEscapeError,
        );
    });
    it("treats backslashes as ordinary filename characters on POSIX", () => {
        const resolved = resolveWithinRoot(root, "nes\\..\\..\\secrets");
        expect(isWithinRoot(root, resolved)).toBe(true);
    });
});

describe("isWithinRoot", () => {
    it("does not treat a sibling with a shared prefix as inside", () => {
        expect(isWithinRoot("/library", "/library-backup/file")).toBe(false);
    });
    it("treats the root itself as inside", () => {
        expect(isWithinRoot(root, root)).toBe(true);
    });
});
describe("resolveRealPathWithinRoot", () => {
    it("resolves a real file inside the root", async () => {
        await expect(
            resolveRealPathWithinRoot(root, "nes/game.nes"),
        ).resolves.toContain("game.nes");
    });
    it("rejects a symlink pointing outside the root", async () => {
        await expect(
            resolveRealPathWithinRoot(root, "nes/escape.nes"),
        ).rejects.toBeInstanceOf(PathEscapeError);
    });
});

describe("toPosixRelative", () => {
  it("produces forward-slash relative paths", () => {
    expect(toPosixRelative(root, path.join(root, "nes", "game.nes"))).toBe(
      "nes/game.nes",
    );
  });
});