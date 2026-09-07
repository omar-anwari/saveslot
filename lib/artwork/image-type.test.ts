import { describe, expect, it } from "vitest";
import { sniffImageFormat } from "./image-type.ts";

function bytes(...values: (number | string)[]): Uint8Array {
    const flat: number[] = [];
    for (const value of values) {
        if (typeof value === "number") flat.push(value);
        else for (const character of value) flat.push(character.charCodeAt(0));
    }
    return new Uint8Array(flat);
}

describe("sniffImageFormat", () => {
    it("recognizes the formats a provider might send", () => {
        expect(sniffImageFormat(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
        expect(sniffImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
        expect(sniffImageFormat(bytes("GIF89a"))).toBe("gif");
        expect(sniffImageFormat(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("webp");
        expect(sniffImageFormat(bytes(0, 0, 0, 0x20, "ftypavif"))).toBe("avif");
    });
    it("returns null for anything else", () => {
        expect(sniffImageFormat(bytes("<!DOCTYPE html>"))).toBeNull();
        expect(sniffImageFormat(bytes("PK", 3, 4))).toBeNull();
        expect(sniffImageFormat(new Uint8Array(0))).toBeNull();
        expect(sniffImageFormat(bytes(0x89, "PN"))).toBeNull();
    });
    it("is not fooled by a RIFF container that is not WebP", () => {
        expect(sniffImageFormat(bytes("RIFF", 0, 0, 0, 0, "WAVEfmt "))).toBeNull();
    });
});