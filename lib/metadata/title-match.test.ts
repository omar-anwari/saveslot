import { describe, expect, it } from "vitest";
import {
    TITLE_MATCH_MIN_SCORE,
    chooseBest,
    comparableTitle,
    scoreTitleMatch,
    searchableTitle,
    titleSimilarity,
} from "./title-match.ts";

describe("comparableTitle", () => {
    it("strips DAT and filename tags", () => {
        expect(comparableTitle("Contra (USA) [!]")).toBe("contra");
        expect(comparableTitle("Metroid Fusion (USA) (En,Fr,De)")).toBe("metroid fusion");
        expect(comparableTitle("Zelda II - The Adventure of Link  (Rev 1) (axekin.com)"))
            .toBe("zelda 2 the adventure of link");
    });
    it("reconciles a trailing article with a leading one", () => {
        expect(comparableTitle("Legend of Zelda, The: A Link to the Past"))
            .toBe(comparableTitle("The Legend of Zelda: A Link to the Past"));
    });
    it("treats roman and arabic numerals as the same", () => {
        expect(comparableTitle("Zelda II")).toBe("zelda 2");
        expect(comparableTitle("Final Fantasy X")).toBe("final fantasy 10");
    });
    it("drops a bare revision marker", () => {
        expect(comparableTitle("Legend of Zelda, The - Link's Awakening Rev 1"))
            .toBe("legend of zelda link s awakening");
    });
});

describe("the titles actually in this library", () => {
    const cases: [string, string][] = [
        ["Zelda 2 - The Adventure Of Link", "Zelda II: The Adventure of Link"],
        ["Legend of Zelda, The - Link's Awakening Rev 1", "The Legend of Zelda: Link's Awakening"],
        ["Legend of Zelda, The: A Link to the Past", "The Legend of Zelda: A Link to the Past"],
    ];
    it.each(cases)("matches %s to %s exactly", (dat, igdb) => {
        expect(comparableTitle(dat)).toBe(comparableTitle(igdb));
        expect(titleSimilarity(dat, igdb)).toBe(1);
    });
    it.each(cases)("scores %s high enough to apply", (dat, igdb) => {
        const result = scoreTitleMatch({
            wantedTitle: dat, candidateTitle: igdb, wantedYear: null, candidateYear: null,
        });
        expect(result.score).toBeGreaterThanOrEqual(TITLE_MATCH_MIN_SCORE);
    });
});

describe("scoreTitleMatch", () => {
    it("rewards an agreeing year and penalizes a conflicting one", () => {
        const base = { wantedTitle: "Contra", candidateTitle: "Contra", wantedYear: 1987 };
        expect(scoreTitleMatch({ ...base, candidateYear: 1987 }).score).toBe(0.95);
        expect(scoreTitleMatch({ ...base, candidateYear: 1988 }).score).toBe(0.9);
        expect(scoreTitleMatch({ ...base, candidateYear: 1996 }).score).toBe(0.75);
    });
    it("refuses to score an unrelated title at all", () => {
        const result = scoreTitleMatch({
            wantedTitle: "Contra", candidateTitle: "Chrono Trigger",
            wantedYear: 1987, candidateYear: 1987,
        });
        expect(result.score).toBe(0);
        expect(result.reasons.map((reason) => reason.code)).toEqual(["title.unrelated"]);
    });
    it("does not let a merely similar title apply itself", () => {
        const result = scoreTitleMatch({
            wantedTitle: "Super Mario Bros.", candidateTitle: "Super Mario Bros. 2",
            wantedYear: null, candidateYear: null,
        });
        expect(result.score).toBeLessThan(TITLE_MATCH_MIN_SCORE);
    });
});

describe("chooseBest", () => {
    it("returns nothing from an empty list", () => {
        expect(chooseBest([])).toBeNull();
    });
    it("accepts a clear winner", () => {
        const result = chooseBest([{ item: "a", score: 0.95 }, { item: "b", score: 0.3 }]);
        expect(result?.item).toBe("a");
        expect(result?.rejected).toBeNull();
    });
    it("refuses a winner that is not good enough", () => {
        expect(chooseBest([{ item: "a", score: 0.6 }])?.rejected).toContain("below");
    });
    it("refuses two plausible games that are too close", () => {
        const result = chooseBest([{ item: "a", score: 0.9 }, { item: "b", score: 0.87 }]);
        expect(result?.rejected).toContain("Too close");
    });
});

describe("searchableTitle", () => {
    it("removes what stops a provider finding the game", () => {
        expect(searchableTitle("Legend of Zelda, The - Link's Awakening Rev 1"))
            .toBe("Legend of Zelda, The - Link's Awakening");
        expect(searchableTitle("Zelda II - The Adventure of Link  (Rev 1) (axekin.com)"))
            .toBe("Zelda II - The Adventure of Link");
        expect(searchableTitle("Metroid Fusion (USA) [!]")).toBe("Metroid Fusion");
    });
    it("leaves a clean title exactly as it is", () => {
        expect(searchableTitle("Legend of Zelda, The: A Link to the Past"))
            .toBe("Legend of Zelda, The: A Link to the Past");
    });
    it("keeps case, punctuation and order, unlike comparableTitle", () => {
        expect(searchableTitle("Chrono Trigger")).toBe("Chrono Trigger");
        expect(comparableTitle("Chrono Trigger")).toBe("chrono trigger");
    });
});