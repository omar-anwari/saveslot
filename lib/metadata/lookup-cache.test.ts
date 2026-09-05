import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { metadataLookups } from "../../db/schema.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../../tests/helpers/test-db.ts";
import {
    ERROR_TTL_MS,
    NOT_FOUND_TTL_MS,
    chooseLookupHash,
    purgeExpiredLookups,
    readLookup,
    writeLookup,
    type LookupKey,
} from "./lookup-cache.ts";

let handle: TestDatabaseHandle;

const key: LookupKey = {
    providerKey: "hasheous",
    algorithm: "sha1",
    value: "3b6ba84809d4fb581ab0783d200cd1e51457749a",
};
const t0 = new Date("2026-09-05T12:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

beforeEach(() => {
    handle = createTestDatabase();
});
afterEach(() => {
    handle.close();
});

describe("chooseLookupHash", () => {
    it("prefers the strongest hash available", () => {
        expect(chooseLookupHash({ sha1: "a", md5: "b", crc32: "c" })).toEqual({
            algorithm: "sha1", value: "a",
        });
        expect(chooseLookupHash({ sha1: null, md5: "b", crc32: "c" })).toEqual({
            algorithm: "md5", value: "b",
        });
        expect(chooseLookupHash({ sha1: null, md5: null, crc32: "c" })).toEqual({
            algorithm: "crc32", value: "c",
        });
    });
    it("normalizes so the same file always keys the same", () => {
        expect(chooseLookupHash({ sha1: "  ABCDEF  ", md5: null, crc32: null })).toEqual({
            algorithm: "sha1", value: "abcdef",
        });
    });
    it("returns null when there is nothing to look up", () => {
        expect(chooseLookupHash({ sha1: null, md5: null, crc32: "   " })).toBeNull();
    });
});

describe("lookup cache", () => {
    it("misses on an empty cache", () => {
        expect(readLookup(handle.db, key, t0)).toBeNull();
    });
    it("round-trips a payload", () => {
        writeLookup(handle.db, key, { status: "matched", payload: { name: "Zelda 2" }, latencyMs: 31000 }, t0);
        const cached = readLookup(handle.db, key, t0);
        expect(cached?.status).toBe("matched");
        expect(cached?.payload).toEqual({ name: "Zelda 2" });
        expect(cached?.latencyMs).toBe(31000);
        expect(cached?.fetchedAt.getTime()).toBe(t0.getTime());
    });
    it("never expires a confirmed match", () => {
        writeLookup(handle.db, key, { status: "matched", payload: { a: 1 } }, t0);
        const row = handle.db.select().from(metadataLookups).get();
        expect(row?.expiresAt).toBeNull();
        expect(readLookup(handle.db, key, later(NOT_FOUND_TTL_MS * 12))?.status).toBe("matched");
    });
    it("expires a miss after the not-found window", () => {
        writeLookup(handle.db, key, { status: "not_found" }, t0);
        expect(readLookup(handle.db, key, later(NOT_FOUND_TTL_MS - 1000))?.status).toBe("not_found");
        expect(readLookup(handle.db, key, later(NOT_FOUND_TTL_MS + 1000))).toBeNull();
    });
    it("expires an error quickly", () => {
        writeLookup(handle.db, key, { status: "error", errorMessage: "HTTP 503" }, t0);
        expect(readLookup(handle.db, key, later(ERROR_TTL_MS - 1000))?.errorMessage).toBe("HTTP 503");
        expect(readLookup(handle.db, key, later(ERROR_TTL_MS + 1000))).toBeNull();
    });
    it("replaces rather than duplicating on rewrite", () => {
        writeLookup(handle.db, key, { status: "error", errorMessage: "HTTP 503" }, t0);
        writeLookup(handle.db, key, { status: "matched", payload: { name: "Zelda 2" } }, later(ERROR_TTL_MS * 2));
        expect(handle.db.select().from(metadataLookups).all()).toHaveLength(1);
        const cached = readLookup(handle.db, key, later(ERROR_TTL_MS * 3));
        expect(cached?.status).toBe("matched");
        expect(cached?.errorMessage).toBeNull();
    });
    it("keys separately per algorithm and per provider", () => {
        writeLookup(handle.db, key, { status: "matched", payload: { via: "sha1" } }, t0);
        writeLookup(handle.db, { ...key, algorithm: "md5" }, { status: "matched", payload: { via: "md5" } }, t0);
        writeLookup(handle.db, { ...key, providerKey: "igdb" }, { status: "not_found" }, t0);
        expect(handle.db.select().from(metadataLookups).all()).toHaveLength(3);
        expect(readLookup(handle.db, key, t0)?.payload).toEqual({ via: "sha1" });
    });
    it("purges only what has actually expired", () => {
        writeLookup(handle.db, key, { status: "matched", payload: {} }, t0);
        writeLookup(handle.db, { ...key, algorithm: "md5" }, { status: "not_found" }, t0);
        writeLookup(handle.db, { ...key, algorithm: "crc32" }, { status: "error" }, t0);
        expect(purgeExpiredLookups(handle.db, later(ERROR_TTL_MS + 1000))).toBe(1);
        expect(handle.db.select().from(metadataLookups).all()).toHaveLength(2);
        expect(purgeExpiredLookups(handle.db, later(NOT_FOUND_TTL_MS + 1000))).toBe(1);
        expect(handle.db.select().from(metadataLookups).all()).toHaveLength(1);
    });
});