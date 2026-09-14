import { describe, expect, it } from "vitest";
import { detectDiscGroups } from "./disc-groups.ts";

function files(...names: string[]) {
    return names.map((name) => ({ relativePath: `saturn/${name}`, fileName: name }));
}

describe("detectDiscGroups", () => {
    it("groups an underscore-numbered disc set", () => {
        const groups = detectDiscGroups(
            files("POLICENAUTS_1.cue", "POLICENAUTS_2.cue", "POLICENAUTS_3.cue"),
        );
        expect(groups.size).toBe(3);
        const first = groups.get("saturn/POLICENAUTS_1.cue");
        expect(first?.title).toBe("POLICENAUTS");
        expect(first?.discNumber).toBe(1);
        expect(first?.isPrimary).toBe(true);
        expect(groups.get("saturn/POLICENAUTS_3.cue")?.isPrimary).toBe(false);
        expect(new Set([...groups.values()].map((entry) => entry.groupKey)).size).toBe(1);
    });
    it("groups an explicitly tagged set on any medium", () => {
        const groups = detectDiscGroups(
            files("Final Fantasy VII (Disc 1 of 3).cue", "Final Fantasy VII (Disc 2 of 3).cue", "Final Fantasy VII (Disc 3 of 3).cue"),
        );
        expect(groups.size).toBe(3);
        expect(groups.get("saturn/Final Fantasy VII (Disc 2 of 3).cue")?.title).toBe("Final Fantasy VII");
    });
    it("does not mistake sequels for discs", () => {
        expect(detectDiscGroups([
            { relativePath: "nes/Mega Man 1.nes", fileName: "Mega Man 1.nes" },
            { relativePath: "nes/Mega Man 2.nes", fileName: "Mega Man 2.nes" },
            { relativePath: "nes/Mega Man 3.nes", fileName: "Mega Man 3.nes" },
        ]).size).toBe(0);
    });
    it("rejects a run that does not start at one", () => {
        expect(detectDiscGroups(files("Final Fantasy 7.cue", "Final Fantasy 8.cue")).size).toBe(0);
    });
    it("rejects duplicates and gaps", () => {
        expect(detectDiscGroups(files("Game_1.cue", "Game_1.chd")).size).toBe(0);
        expect(detectDiscGroups(files("Game_1.cue", "Game_3.cue")).size).toBe(0);
    });
    it("leaves a lone numbered file alone", () => {
        expect(detectDiscGroups(files("POLICENAUTS_1.cue")).size).toBe(0);
    });
    it("keeps sets in different folders apart", () => {
        const groups = detectDiscGroups([
            { relativePath: "psx/a/Game_1.cue", fileName: "Game_1.cue" },
            { relativePath: "psx/a/Game_2.cue", fileName: "Game_2.cue" },
            { relativePath: "psx/b/Game_1.cue", fileName: "Game_1.cue" },
            { relativePath: "psx/b/Game_2.cue", fileName: "Game_2.cue" },
        ]);
        expect(new Set([...groups.values()].map((entry) => entry.groupKey)).size).toBe(2);
    });
});
describe("CD-numbered sets and folder titles", () => {
    it("groups SAKURA_CD1 / SAKURA_CD2 and names them after the folder", () => {
        const groups = detectDiscGroups([
            { relativePath: "saturn/roms/Sakura Taisen/SAKURA_CD1.CUE", fileName: "SAKURA_CD1.CUE" },
            { relativePath: "saturn/roms/Sakura Taisen/SAKURA_CD2.CUE", fileName: "SAKURA_CD2.CUE" },
        ]);
        expect(groups.size).toBe(2);
        const first = groups.get("saturn/roms/Sakura Taisen/SAKURA_CD1.CUE");
        expect(first?.title).toBe("Sakura Taisen");
        expect(first?.discNumber).toBe(1);
        expect(first?.isPrimary).toBe(true);
    });
    it("keeps the stem when the folder is generic or shared", () => {
        expect(
            detectDiscGroups([
                { relativePath: "psx/roms/GAME_CD1.cue", fileName: "GAME_CD1.cue" },
                { relativePath: "psx/roms/GAME_CD2.cue", fileName: "GAME_CD2.cue" },
            ]).get("psx/roms/GAME_CD1.cue")?.title,
        ).toBe("GAME");
        const shared = detectDiscGroups([
            { relativePath: "psx/mixed/A_CD1.cue", fileName: "A_CD1.cue" },
            { relativePath: "psx/mixed/A_CD2.cue", fileName: "A_CD2.cue" },
            { relativePath: "psx/mixed/B_CD1.cue", fileName: "B_CD1.cue" },
            { relativePath: "psx/mixed/B_CD2.cue", fileName: "B_CD2.cue" },
        ]);
        expect(shared.get("psx/mixed/A_CD1.cue")?.title).toBe("A");
    });
    it("still refuses a bare trailing number with no separator", () => {
        expect(
            detectDiscGroups([
                { relativePath: "psx/SAKURA1.cue", fileName: "SAKURA1.cue" },
                { relativePath: "psx/SAKURA2.cue", fileName: "SAKURA2.cue" },
            ]).size,
        ).toBe(0);
    });
});