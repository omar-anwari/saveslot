import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { walkLibrary } from "./walk.ts";

let workspace = "";
let root = "";

beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "saveslot-walk-"));
    root = path.join(workspace, "library");
    await mkdir(path.join(root, "nes", "Homebrew"), { recursive: true });
    await mkdir(path.join(root, "snes"), { recursive: true });
    await mkdir(path.join(root, "megadrive"), { recursive: true });
    await mkdir(path.join(root, "bios", "psx"), { recursive: true });
    await mkdir(path.join(root, "dreamcast"), { recursive: true });
    await mkdir(path.join(workspace, "outside"), { recursive: true });
    await writeFile(path.join(root, "nes", "Contra (USA).nes"), "rom");
    await writeFile(path.join(root, "nes", "Homebrew", "Demo.nes"), "rom");
    await writeFile(path.join(root, "nes", "notes.txt"), "not a rom");
    await writeFile(path.join(root, "snes", "Chrono Trigger.sfc"), "rom");
    await writeFile(path.join(root, "snes", ".DS_Store"), "junk");
    await writeFile(path.join(root, "megadrive", "Sonic.md"), "rom");
    await writeFile(path.join(root, "bios", "psx", "scph1001.bin"), "bios");
    await writeFile(path.join(root, "dreamcast", "Game.gdi"), "rom");
    await writeFile(path.join(workspace, "outside", "Secret.nes"), "rom");
    await symlink(
        path.join(workspace, "outside", "Secret.nes"),
        path.join(root, "nes", "Linked.nes"),
    );
});

afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
});

describe("walkLibrary", () => {
    it("discovers supported files and recurses into subfolders", async () => {
        const result = await walkLibrary(root);
        const paths = result.files.map((file) => file.relativePath);
        expect(paths).toContain("nes/Contra (USA).nes");
        expect(paths).toContain("nes/Homebrew/Demo.nes");
        expect(paths).toContain("snes/Chrono Trigger.sfc");
        expect(paths).toContain("megadrive/Sonic.md");
    });
    it("maps a folder alias to its canonical platform slug", async () => {
        const result = await walkLibrary(root);
        const sonic = result.files.find((f) => f.fileName === "Sonic.md");
        expect(sonic?.platformSlug).toBe("genesis");
    });
    it("ignores unsupported extensions and dotfiles", async () => {
        const result = await walkLibrary(root);
        const names = result.files.map((file) => file.fileName);
        expect(names).not.toContain("notes.txt");
        expect(names).not.toContain(".DS_Store");
    });
    it("does not descend into the bios directory", async () => {
        const result = await walkLibrary(root);
        expect(result.files.some((f) => f.relativePath.startsWith("bios/"))).toBe(
            false,
        );
    });
    it("warns about an unrecognised platform folder without failing", async () => {
        const result = await walkLibrary(root);
        const warning = result.warnings.find(
            (w) => w.type === "unknown-platform-folder",
        );
        expect(warning?.relativePath).toBe("dreamcast");
    });
    it("refuses a symlink that escapes the library root", async () => {
        const result = await walkLibrary(root);
        expect(result.files.some((f) => f.fileName === "Linked.nes")).toBe(false);
        expect(result.warnings.some((w) => w.type === "symlink-escape")).toBe(true);
    });
    it("records size and modification time", async () => {
        const result = await walkLibrary(root);
        const contra = result.files.find((f) => f.fileName === "Contra (USA).nes");
        expect(contra?.sizeBytes).toBe(3);
        expect(contra?.modifiedAtFs).toBeInstanceOf(Date);
    });
    it("can be scoped to a single platform", async () => {
        const result = await walkLibrary(root, { platformSlug: "snes" });
        expect(result.files).toHaveLength(1);
        expect(result.files[0]?.platformSlug).toBe("snes");
    });
});