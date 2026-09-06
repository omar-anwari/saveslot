import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetadataProviderError } from "../provider-error.ts";
import {
    TOKEN_REFRESH_MARGIN_MS,
    createFileTokenStore,
    createIgdbClient,
    createMemoryTokenStore,
} from "./igdb-client.ts";

const HOUR = 60 * 60 * 1000;

function tokenResponse(expiresIn = 4_894_193) {
    return new Response(JSON.stringify({ access_token: "tok-1", expires_in: expiresIn, token_type: "bearer" }), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

function client(
    responses: Response[],
    extras: { now?: () => number; sleeps?: number[]; store?: ReturnType<typeof createMemoryTokenStore> } = {},
) {
    const spy = vi.fn();
    for (const response of responses) spy.mockResolvedValueOnce(response);
    const sleeps = extras.sleeps ?? [];
    return {
        spy,
        sleeps,
        client: createIgdbClient({
            clientId: "cid",
            clientSecret: "secret",
            fetchImpl: spy as unknown as typeof fetch,
            tokenStore: extras.store,
            now: extras.now ?? (() => 0),
            sleep: (ms) => {
                sleeps.push(ms);
                return Promise.resolve();
            },
            minIntervalMs: 300,
        }),
    };
}

describe("createIgdbClient", () => {
    it("gets a token, then sends both required headers", async () => {
        const { client: igdb, spy } = client([tokenResponse(), jsonResponse([{ id: 1025 }])]);
        const result = await igdb.query<{ id: number }[]>("games", "fields name; where id = 1025;");
        expect(result).toEqual([{ id: 1025 }]);
        const [url, init] = spy.mock.calls[1] as [string, RequestInit];
        expect(url).toBe("https://api.igdb.com/v4/games");
        expect(init.body).toBe("fields name; where id = 1025;");
        const headers = init.headers as Record<string, string>;
        expect(headers["Client-ID"]).toBe("cid");
        expect(headers.Authorization).toBe("Bearer tok-1");
    });
    it("never puts the secret in the request body", async () => {
        const { client: igdb, spy } = client([tokenResponse(), jsonResponse([])]);
        await igdb.query("games", "fields name;");
        const [tokenUrl, tokenInit] = spy.mock.calls[0] as [string, RequestInit];
        expect(tokenUrl).toContain("client_credentials");
        expect(tokenInit.body).toBeUndefined();
    });
    it("reuses a valid token across queries", async () => {
        const { client: igdb, spy } = client([tokenResponse(), jsonResponse([]), jsonResponse([])]);
        await igdb.query("games", "a");
        await igdb.query("games", "b");
        expect(spy).toHaveBeenCalledTimes(3);
    });
    it("refreshes a token inside the safety margin", async () => {
        const store = createMemoryTokenStore({ accessToken: "old", expiresAt: TOKEN_REFRESH_MARGIN_MS - HOUR });
        const { client: igdb, spy } = client([tokenResponse(), jsonResponse([])], { store });
        await igdb.query("games", "a");
        const [, init] = spy.mock.calls[1] as [string, RequestInit];
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    });
    it("keeps a token that is still comfortably valid", async () => {
        const store = createMemoryTokenStore({ accessToken: "still-good", expiresAt: TOKEN_REFRESH_MARGIN_MS + HOUR });
        const { client: igdb, spy } = client([jsonResponse([])], { store });
        await igdb.query("games", "a");
        expect(spy).toHaveBeenCalledTimes(1);
        const [, init] = spy.mock.calls[0] as [string, RequestInit];
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer still-good");
    });
    it("retries once with a fresh token after a 401", async () => {
        const store = createMemoryTokenStore({ accessToken: "revoked", expiresAt: TOKEN_REFRESH_MARGIN_MS + HOUR });
        const { client: igdb, spy } = client(
            [jsonResponse({}, 401), tokenResponse(), jsonResponse([{ id: 7 }])],
            { store },
        );
        await expect(igdb.query("games", "a")).resolves.toEqual([{ id: 7 }]);
        expect(spy).toHaveBeenCalledTimes(3);
    });
    it("gives up if the retry is also rejected", async () => {
        const store = createMemoryTokenStore({ accessToken: "revoked", expiresAt: TOKEN_REFRESH_MARGIN_MS + HOUR });
        const { client: igdb } = client([jsonResponse({}, 401), tokenResponse(), jsonResponse({}, 401)], { store });
        await expect(igdb.query("games", "a")).rejects.toThrow(MetadataProviderError);
    });
    it("reports a rate limit with its retry window", async () => {
        const { client: igdb } = client([tokenResponse(), jsonResponse({}, 429, { "retry-after": "5" })]);
        await expect(igdb.query("games", "a")).rejects.toMatchObject({
            status: 429,
            retryAfterMs: 5000,
        });
    });
    it("spaces requests to stay under the limit", async () => {
        const sleeps: number[] = [];
        const { client: igdb } = client(
            [tokenResponse(), jsonResponse([]), jsonResponse([])],
            { sleeps },
        );
        await igdb.query("games", "a");
        await igdb.query("games", "b");
        expect(sleeps).toEqual([300]);
    });
    it("surfaces an Apicalypse error body", async () => {
        const { client: igdb } = client([
            tokenResponse(),
            new Response("Syntax Error: expecting a field name", { status: 400 }),
        ]);
        await expect(igdb.query("games", "bad")).rejects.toThrow(/Syntax Error/);
    });
});

describe("createFileTokenStore", () => {
    let dir = "";
    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), "saveslot-igdb-"));
    });
    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });
    it("round-trips a token and keeps it private", async () => {
        const file = path.join(dir, "nested", "igdb-token.json");
        const store = createFileTokenStore(file);
        await store.write({ accessToken: "tok", expiresAt: 123 });
        expect(await store.read()).toEqual({ accessToken: "tok", expiresAt: 123 });
        expect((await stat(file)).mode & 0o777).toBe(0o600);
    });
    it("treats a missing or corrupt file as no token", async () => {
        const file = path.join(dir, "igdb-token.json");
        expect(await createFileTokenStore(file).read()).toBeNull();
        await writeFile(file, "{ not json");
        expect(await createFileTokenStore(file).read()).toBeNull();
        await writeFile(file, JSON.stringify({ accessToken: 42 }));
        expect(await createFileTokenStore(file).read()).toBeNull();
    });
});