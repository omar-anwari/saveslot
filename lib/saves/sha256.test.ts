import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256HexSync } from "./sha256.ts";

function oracle(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

describe("sha256HexSync", () => {
    it("matches the published vectors", () => {
        expect(sha256HexSync(new Uint8Array(0)))
            .toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        expect(sha256HexSync(new TextEncoder().encode("abc")))
            .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    });
    it("agrees with node at every block boundary", () => {
        for (const length of [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128]) {
            const bytes = new Uint8Array(randomBytes(length));
            expect(sha256HexSync(bytes), `length ${length}`).toBe(oracle(bytes));
        }
    });
    it("agrees with node on save-sized buffers", () => {
        for (const length of [2048, 32768, 131072, 1048576]) {
            const bytes = new Uint8Array(randomBytes(length));
            expect(sha256HexSync(bytes), `length ${length}`).toBe(oracle(bytes));
        }
    });
    it("always returns 64 lowercase hex characters", () => {
        expect(sha256HexSync(new Uint8Array([0]))).toMatch(/^[0-9a-f]{64}$/);
        expect(sha256HexSync(new Uint8Array(0))).toHaveLength(64);
    });
    it("does not read past a view into a larger buffer", () => {
        const backing = new Uint8Array([9, 9, 1, 2, 3, 9, 9]);
        const view = backing.subarray(2, 5);
        expect(sha256HexSync(view)).toBe(oracle(new Uint8Array([1, 2, 3])));
    });
});