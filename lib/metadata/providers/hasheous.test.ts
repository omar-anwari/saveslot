import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createHasheousProvider } from "./hasheous.ts";
import type { HashMatchInput, MetadataProvider } from "../types.ts";
import { MetadataProviderError } from "../provider-error.ts";

const FIXTURE = path.join(process.cwd(), "tests/fixtures/hasheous/zelda2-nes.json");
let recorded: unknown;

beforeAll(async () => {
    recorded = JSON.parse(await readFile(FIXTURE, "utf8"));
});

const zelda2: HashMatchInput = {
    crc32: "6f151d25",
    md5: "f8f0e28fe9461bae1e99fea3445c0e91",
    sha1: "3b6ba84809d4fb581ab0783d200cd1e51457749a",
    platformSlug: "nes",
    fileSize: 262160,
};

function providerReturning(status: number, body: unknown) {
    const spy = vi.fn().mockResolvedValue(
        new Response(typeof body === "string" ? body : JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
        }),
    );
    const provider = createHasheousProvider({
        baseUrl: "https://hasheous.test",
        timeoutMs: 5000,
        enabled: true,
        fetchImpl: spy as unknown as typeof fetch,
    });
    return { spy, provider };
}

async function firstCandidate(provider: MetadataProvider, input: HashMatchInput) {
    const { candidates } = await provider.matchByHashes(input);
    return candidates[0];
}

describe("createHasheousProvider", () => {
    it("normalizes a real recorded response", async () => {
        const { provider } = providerReturning(200, recorded);
        const candidate = await firstCandidate(provider, zelda2);
        expect(candidate?.score).toBe(1);
        expect(candidate?.matchType).toBe("hash");
        expect(candidate?.platformSlug).toBe("nes");
        expect(candidate?.metadata.title).toBe("Zelda 2 - The Adventure Of Link");
        expect(candidate?.metadata.publisher).toBe("Nintendo");
        expect(candidate?.metadata.regions).toEqual(["EU"]);
        expect(candidate?.metadata.languages).toEqual(["de", "en", "es", "fr", "it", "pt"]);
    });
    it("returns the raw payload and a latency for the cache", async () => {
        const { provider } = providerReturning(200, recorded);
        const result = await provider.matchByHashes(zelda2);
        expect(result.status).toBe("matched");
        expect(result.payload).toEqual(recorded);
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
    it("re-scores a cached payload without calling out", async () => {
        const { provider, spy } = providerReturning(200, recorded);
        const { payload } = await provider.matchByHashes(zelda2);
        spy.mockClear();
        const [candidate] = provider.normalizeCached(payload, zelda2);
        expect(candidate?.score).toBe(1);
        expect(candidate?.metadata.title).toBe("Zelda 2 - The Adventure Of Link");
        expect(spy).not.toHaveBeenCalled();
    });
    it("rejects a cached payload it cannot parse", () => {
        const { provider } = providerReturning(200, recorded);
        expect(() => provider.normalizeCached({ platform: 42 }, zelda2)).toThrow(MetadataProviderError);
        expect(provider.normalizeCached(null, zelda2)).toEqual([]);
    });
    it("turns empty strings into nulls", async () => {
        const { provider } = providerReturning(200, recorded);
        const candidate = await firstCandidate(provider, zelda2);
        expect(candidate?.metadata.releaseYear).toBeNull();
        expect(candidate?.metadata.summary).toBeNull();
    });
    it("keeps only mapped external ids", async () => {
        const { provider } = providerReturning(200, recorded);
        const candidate = await firstCandidate(provider, zelda2);
        const sources = candidate?.metadata.externalIds.map((entry) => entry.source) ?? [];
        expect(sources).toContain("IGDB");
        expect(sources).not.toContain("Steam");
        const igdb = candidate?.metadata.externalIds.find((entry) => entry.source === "IGDB");
        expect(igdb?.id).toBe("1025");
        expect(igdb?.confidence).toBe("automatic");
    });
    it("records why it matched", async () => {
        const { provider } = providerReturning(200, recorded);
        const candidate = await firstCandidate(provider, zelda2);
        const codes = candidate?.reasons.map((reason) => reason.code) ?? [];
        expect(codes).toContain("hash.sha1");
        expect(codes).toContain("platform.agree");
        expect(codes).toContain("size.agree");
    });
    it("rejects a candidate whose platform disagrees", async () => {
        const { provider } = providerReturning(200, recorded);
        const candidate = await firstCandidate(provider, { ...zelda2, platformSlug: "snes" });
        expect(candidate?.score).toBe(0);
        expect(candidate?.reasons.some((reason) => reason.code === "platform.mismatch")).toBe(true);
    });
    it("does not trust a match it cannot confirm", async () => {
        const { provider } = providerReturning(200, recorded);
        const candidate = await firstCandidate(provider, {
            ...zelda2,
            sha1: "a".repeat(40),
            md5: "b".repeat(32),
            crc32: "cccccccc",
        });
        expect(candidate?.score).toBe(0.8);
        expect(candidate?.reasons.some((reason) => reason.code === "hash.unverified")).toBe(true);
    });
    it("applies a CRC32-only signature when the size corroborates it", async () => {
        const crcOnly = structuredClone(recorded) as {
            signature: { rom: { md5: string; sha1: string; size: number } };
        };
        crcOnly.signature.rom.md5 = "";
        crcOnly.signature.rom.sha1 = "";
        const { provider } = providerReturning(200, crcOnly);
        const candidate = await firstCandidate(provider, zelda2);
        expect(candidate?.score).toBe(0.98);
        expect(candidate?.reasons.some((reason) => reason.code === "hash.crc32+size")).toBe(true);
    });

    it("will not apply a CRC32 match with no size agreement", async () => {
        const crcOnly = structuredClone(recorded) as {
            signature: { rom: { md5: string; sha1: string } };
        };
        crcOnly.signature.rom.md5 = "";
        crcOnly.signature.rom.sha1 = "";
        const { provider } = providerReturning(200, crcOnly);
        const candidate = await firstCandidate(provider, { ...zelda2, fileSize: 999 });
        expect(candidate?.score).toBe(0.9);
        expect(candidate?.reasons.some((reason) => reason.code === "hash.crc32")).toBe(true);
    });
    it("treats 404 as no match, not an error", async () => {
        const { provider } = providerReturning(
            404,
            "The provided hash was not found in any signature database.",
        );
        const result = await provider.matchByHashes(zelda2);
        expect(result.status).toBe("not_found");
        expect(result.candidates).toEqual([]);
        expect(result.payload).toBeNull();
    });
    it("throws on a server error", async () => {
        const { provider } = providerReturning(503, "unavailable");
        await expect(provider.matchByHashes(zelda2)).rejects.toBeInstanceOf(MetadataProviderError);
    });
    it("does not call out at all with no hashes", async () => {
        const { provider, spy } = providerReturning(200, recorded);
        const result = await provider.matchByHashes({
            crc32: null, md5: null, sha1: null, platformSlug: "nes", fileSize: null,
        });
        expect(result.status).toBe("not_found");
        expect(result.candidates).toEqual([]);
        expect(spy).not.toHaveBeenCalled();
    });
    it("reports health from a 404 probe", async () => {
        const { provider } = providerReturning(404, "not found");
        const health = await provider.healthCheck();
        expect(health.ok).toBe(true);
    });
    it("honours an aborted caller signal", async () => {
        const provider = createHasheousProvider({
            baseUrl: "https://hasheous.test",
            timeoutMs: 5000,
            enabled: true,
            fetchImpl: ((_url: string, init: RequestInit) =>
                new Promise((_resolve, reject) => {
                    init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
                })) as unknown as typeof fetch,
        });
        const controller = new AbortController();
        const pending = provider.matchByHashes(zelda2, controller.signal);
        controller.abort();
        await expect(pending).rejects.toThrow("aborted");
    });
});