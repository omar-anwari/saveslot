import { describe, expect, it } from "vitest";
import { createProgressBar } from "./progress.ts";

function fakeStream(isTTY: boolean) {
    const writes: string[] = [];
    return { writes, stream: { write: (chunk: string) => writes.push(chunk), isTTY } };
}

describe("createProgressBar", () => {
    it("writes nothing when the output is not a terminal", () => {
        const { writes, stream } = fakeStream(false);
        const bar = createProgressBar({ stream });
        bar.render("hashing", 5, 10, true);
        bar.finish();
        expect(writes).toEqual([]);
    });
    it("draws a bar with a percentage and a count", () => {
        const { writes, stream } = fakeStream(true);
        const bar = createProgressBar({ stream, width: 10 });
        bar.render("hashing", 5, 10, true);
        expect(writes[0]).toContain("[#####-----]");
        expect(writes[0]).toContain("50%");
        expect(writes[0]).toContain("5/10");
        expect(writes[0]?.startsWith("\r")).toBe(true);
    });
    it("throttles redraws but never the forced one", () => {
        let clock = 0;
        const { writes, stream } = fakeStream(true);
        const bar = createProgressBar({ stream, minIntervalMs: 100, now: () => clock });
        bar.render("hashing", 1, 10);
        bar.render("hashing", 2, 10);
        clock = 50;
        bar.render("hashing", 3, 10);
        expect(writes).toHaveLength(1);
        clock = 200;
        bar.render("hashing", 4, 10);
        expect(writes).toHaveLength(2);
        bar.render("hashing", 10, 10, true);
        expect(writes).toHaveLength(3);
        expect(writes[2]).toContain("100%");
    });
    it("ends the line only if something was drawn", () => {
        const { writes, stream } = fakeStream(true);
        const bar = createProgressBar({ stream });
        bar.finish();
        expect(writes).toEqual([]);
        bar.render("hashing", 1, 2, true);
        bar.finish();
        expect(writes.at(-1)).toBe("\n");
        bar.finish();
        expect(writes.filter((entry) => entry === "\n")).toHaveLength(1);
    });
    it("shows a complete bar when there is nothing to do", () => {
        const { writes, stream } = fakeStream(true);
        const bar = createProgressBar({ stream, width: 4 });
        bar.render("hashing", 0, 0, true);
        expect(writes[0]).toContain("[####]");
        expect(writes[0]).toContain("100%");
    });
});