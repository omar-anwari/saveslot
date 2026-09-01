import { describe, expect, it } from "vitest";
import { parseRangeHeader } from "./range.ts";

const SIZE = 1000;

describe("parseRangeHeader", () => {
    it("returns none without a header", () => {
        expect(parseRangeHeader(null, SIZE)).toEqual({ type: "none" });
    });
    it("reads a closed range with an inclusive end", () => {
        expect(parseRangeHeader("bytes=0-499", SIZE)).toEqual({
            type: "range",
            start: 0,
            end: 499,
        });
    });
    it("reads an open ended range", () => {
        expect(parseRangeHeader("bytes=500-", SIZE)).toEqual({
            type: "range",
            start: 500,
            end: 999,
        });
    });
    it("reads a suffix range", () => {
        expect(parseRangeHeader("bytes=-200", SIZE)).toEqual({
            type: "range",
            start: 800,
            end: 999,
        });
    });
    it("clamps a suffix longer than the file", () => {
        expect(parseRangeHeader("bytes=-5000", SIZE)).toEqual({
            type: "range",
            start: 0,
            end: 999,
        });
    });
    it("clamps an end past the file", () => {
        expect(parseRangeHeader("bytes=900-99999", SIZE)).toEqual({
            type: "range",
            start: 900,
            end: 999,
        });
    });
    it("allows the single final byte", () => {
        expect(parseRangeHeader("bytes=999-999", SIZE)).toEqual({
            type: "range",
            start: 999,
            end: 999,
        });
    });
    it("rejects a start past the end of the file", () => {
        expect(parseRangeHeader("bytes=1000-1100", SIZE)).toEqual({
            type: "unsatisfiable",
        });
    });
    it("rejects a backwards range", () => {
        expect(parseRangeHeader("bytes=500-100", SIZE)).toEqual({
            type: "unsatisfiable",
        });
    });
    it("rejects any range against an empty file", () => {
        expect(parseRangeHeader("bytes=0-10", 0)).toEqual({ type: "unsatisfiable" });
    });
    it("rejects a zero length suffix", () => {
        expect(parseRangeHeader("bytes=-0", SIZE)).toEqual({
            type: "unsatisfiable",
        });
    });
    it("ignores multiple ranges and serves the whole file", () => {
        expect(parseRangeHeader("bytes=0-99,200-299", SIZE)).toEqual({
            type: "none",
        });
    });
    it("ignores units it doesn't understand", () => {
        expect(parseRangeHeader("items=0-10", SIZE)).toEqual({ type: "none" });
    });
    it("ignores junk instead of guessing", () => {
        expect(parseRangeHeader("bytes=abc-def", SIZE)).toEqual({ type: "none" });
        expect(parseRangeHeader("bytes=", SIZE)).toEqual({ type: "none" });
        expect(parseRangeHeader("bytes=100", SIZE)).toEqual({ type: "none" });
    });
    it("tolerates whitespace and case", () => {
        expect(parseRangeHeader("  BYTES=0-9  ", SIZE)).toEqual({
            type: "range",
            start: 0,
            end: 9,
        });
    });
});