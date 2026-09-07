import { describe, expect, it } from "vitest";
import {
    SESSION_TTL_MS,
    createSessionToken,
    verifyPassword,
    verifySessionToken,
} from "./session.ts";

const SECRET = "a".repeat(48);
const OTHER = "b".repeat(48);
const NOW = Date.UTC(2026, 8, 7, 12, 0, 0);

describe("session tokens", () => {
    it("round-trips and reports its window", () => {
        const token = createSessionToken(SECRET, { now: NOW });
        const session = verifySessionToken(SECRET, token, NOW);
        expect(session?.issuedAt).toBe(NOW);
        expect(session?.expiresAt).toBe(NOW + SESSION_TTL_MS);
    });
    it("expires", () => {
        const token = createSessionToken(SECRET, { now: NOW, ttlMs: 1000 });
        expect(verifySessionToken(SECRET, token, NOW + 999)).not.toBeNull();
        expect(verifySessionToken(SECRET, token, NOW + 1000)).toBeNull();
        expect(verifySessionToken(SECRET, token, NOW + 5000)).toBeNull();
    });
    it("rejects a token signed with a different secret", () => {
        const token = createSessionToken(OTHER, { now: NOW });
        expect(verifySessionToken(SECRET, token, NOW)).toBeNull();
    });
    it("rejects a tampered expiry", () => {
        const token = createSessionToken(SECRET, { now: NOW, ttlMs: 1000 });
        const [version, , signature] = token.split(".") as [string, string, string];
        const forged = Buffer.from(
            JSON.stringify({ iat: NOW, exp: NOW + 10 ** 12 }),
            "utf8",
        ).toString("base64url");
        expect(verifySessionToken(SECRET, `${version}.${forged}.${signature}`, NOW)).toBeNull();
    });
    it("rejects a tampered signature", () => {
        const token = createSessionToken(SECRET, { now: NOW });
        const [version, encoded] = token.split(".") as [string, string];
        expect(verifySessionToken(SECRET, `${version}.${encoded}.deadbeef`, NOW)).toBeNull();
        expect(verifySessionToken(SECRET, `${version}.${encoded}.`, NOW)).toBeNull();
    });
    it("rejects anything that is not a token", () => {
        for (const value of [
            undefined, null, "", "garbage", "v1.only-two", "v1.a.b.c",
            "v2.abc.def", ".".repeat(2),
        ]) {
            expect(verifySessionToken(SECRET, value as string | undefined, NOW)).toBeNull();
        }
    });
    it("rejects a payload that is valid base64 but not a session", () => {
        const encoded = Buffer.from("[]", "utf8").toString("base64url");
        const body = `v1.${encoded}`;
        const token = createSessionToken(SECRET, { now: NOW });
        const signature = token.split(".")[2]!;
        expect(verifySessionToken(SECRET, `${body}.${signature}`, NOW)).toBeNull();
    });
    it("produces a different token each time the clock moves", () => {
        expect(createSessionToken(SECRET, { now: NOW })).not.toBe(
            createSessionToken(SECRET, { now: NOW + 1 }),
        );
    });
});

describe("verifyPassword", () => {
    it("accepts the right password", () => {
        expect(verifyPassword("correct horse battery staple", "correct horse battery staple")).toBe(true);
    });
    it("rejects a wrong one, including near misses and length differences", () => {
        expect(verifyPassword("hunter2", "hunter3")).toBe(false);
        expect(verifyPassword("hunter2", "hunter")).toBe(false);
        expect(verifyPassword("hunter2", "hunter2 ")).toBe(false);
        expect(verifyPassword("hunter2", "")).toBe(false);
    });
    it("rejects everything when no password is configured", () => {
        expect(verifyPassword("", "")).toBe(false);
        expect(verifyPassword("", "anything")).toBe(false);
    });
    it("rejects a non-string", () => {
        expect(verifyPassword("hunter2", undefined)).toBe(false);
        expect(verifyPassword("hunter2", 42)).toBe(false);
        expect(verifyPassword("hunter2", { toString: () => "hunter2" })).toBe(false);
    });
});