import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    ABSENT_IN_PINNED_BUILD,
    PINNED_VERSION,
    REQUIRED_EJS_GLOBALS,
    REQUIRED_EMULATOR_METHODS,
    REQUIRED_GAME_MANAGER_METHODS,
} from "./contract.ts";

const DATA_DIR = path.resolve(process.cwd(), "public/emulatorjs/data");
const GAME_MANAGER = path.join(DATA_DIR, "src", "GameManager.js");
const installed = existsSync(GAME_MANAGER);

function definesMember(source: string, name: string): boolean {
    return new RegExp(`(^|[\\s.])${name}\\s*[(=]`, "m").test(source);
}
function readAllSource(): string {
    const srcDir = path.join(DATA_DIR, "src");
    const parts = readdirSync(srcDir)
        .filter((name) => name.endsWith(".js"))
        .map((name) => readFileSync(path.join(srcDir, name), "utf8"));
    parts.push(readFileSync(path.join(DATA_DIR, "loader.js"), "utf8"));
    return parts.join("\n");
}
describe.skipIf(!installed)("EmulatorJS API contract", () => {
    it("matches the pinned version", () => {
        const record = JSON.parse(
            readFileSync(
                path.resolve(process.cwd(), "public/emulatorjs/installed-version.json"),
                "utf8",
            ),
        ) as { version: string };
        expect(record.version).toBe(PINNED_VERSION);
    });
    it("GameManager still defines every method the adapter calls", () => {
        const source = readFileSync(GAME_MANAGER, "utf8");
        const missing = REQUIRED_GAME_MANAGER_METHODS.filter(
            (name) => !definesMember(source, name),
        );
        expect(missing).toEqual([]);
    });
    it("the emulator still defines pause and play", () => {
        const source = readAllSource();
        const missing = REQUIRED_EMULATOR_METHODS.filter(
            (name) => !definesMember(source, name),
        );
        expect(missing).toEqual([]);
    });
    it("every EJS global we rely on is still read by the build", () => {
        const source = readAllSource();
        const missing = REQUIRED_EJS_GLOBALS.filter(
            (name) => !source.includes(name),
        );
        expect(missing).toEqual([]);
    });
    it("the options spec §10.3 names but 4.2.3 lacks are still absent", () => {
        const source = readAllSource();
        const nowPresent = ABSENT_IN_PINNED_BUILD.filter((name) =>
            source.includes(name),
        );
        expect(nowPresent).toEqual([]);
    });
});