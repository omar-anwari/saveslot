import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    DEFAULT_BACKOFF_MS,
    MetadataProviderError,
    parseRetryAfter,
} from "../provider-error.ts";

export const IGDB_KEY = "igdb";
export const IGDB_BASE_URL = "https://api.igdb.com/v4";
export const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

// IGDB only lets you do 4 requests a second, keep it at 3 a sec
export const DEFAULT_MIN_INTERVAL_MS = 300;
// Don't change this, refreshes the token a day before it expires
export const TOKEN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;
export interface StoredToken {
    accessToken: string;
    expiresAt: number;
}
export interface TokenStore {
    read(): Promise<StoredToken | null>;
    write(token: StoredToken): Promise<void>;
}
export function createMemoryTokenStore(initial: StoredToken | null = null): TokenStore {
    let held = initial;
    return {
        read: () => Promise.resolve(held),
        write: (token) => {
            held = token;
            return Promise.resolve();
        },
    };
}
export function createFileTokenStore(filePath: string): TokenStore {
    return {
        async read() {
            try {
                const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
                if (typeof parsed !== "object" || parsed === null) return null;
                const { accessToken, expiresAt } = parsed as Record<string, unknown>;
                if (typeof accessToken !== "string" || typeof expiresAt !== "number") return null;
                return { accessToken, expiresAt };
            } catch {
                return null;
            }
        },
        async write(token) {
            await mkdir(path.dirname(filePath), { recursive: true });
            await writeFile(filePath, JSON.stringify(token), { encoding: "utf8", mode: 0o600 });
            await chmod(filePath, 0o600);
        },
    };
}
export interface IgdbClientOptions {
    clientId: string;
    clientSecret: string;
    tokenStore?: TokenStore;
    fetchImpl?: typeof fetch;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    minIntervalMs?: number;
}
export interface IgdbClient {
    query<T>(endpoint: string, apicalypse: string, signal?: AbortSignal): Promise<T>;
    ensureToken(signal?: AbortSignal): Promise<void>;
}
export function createIgdbClient(options: IgdbClientOptions): IgdbClient {
    const doFetch = options.fetchImpl ?? fetch;
    const now = options.now ?? (() => Date.now());
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const store = options.tokenStore ?? createMemoryTokenStore();
    const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    let cached: StoredToken | null = null;
    let nextAllowedAt = 0;
    let gate: Promise<void> = Promise.resolve();
    async function takeSlot(): Promise<void> {
        const mine = gate.then(async () => {
            const wait = nextAllowedAt - now();
            if (wait > 0) await sleep(wait);
            nextAllowedAt = now() + minIntervalMs;
        });
        gate = mine.catch(() => undefined);
        await mine;
    }
    async function fetchToken(signal?: AbortSignal): Promise<StoredToken> {
        const url = new URL(TWITCH_TOKEN_URL);
        url.searchParams.set("client_id", options.clientId);
        url.searchParams.set("client_secret", options.clientSecret);
        url.searchParams.set("grant_type", "client_credentials");
        const response = await doFetch(url.toString(), { method: "POST", signal });
        if (!response.ok) {
            throw new MetadataProviderError(
                `Twitch token request failed with HTTP ${response.status}.`,
                IGDB_KEY,
                response.status,
                response.status === 429
                    ? parseRetryAfter(response.headers.get("retry-after")) ?? DEFAULT_BACKOFF_MS
                    : null,
            );
        }
        const body: unknown = await response.json();
        const { access_token: accessToken, expires_in: expiresIn } =
            (body ?? {}) as Record<string, unknown>;
        if (typeof accessToken !== "string" || typeof expiresIn !== "number") {
            throw new MetadataProviderError(
                "Twitch returned an unrecognized token response.",
                IGDB_KEY,
                response.status,
            );
        }
        const token: StoredToken = { accessToken, expiresAt: now() + expiresIn * 1000 };
        await store.write(token);
        return token;
    }
    async function currentToken(force: boolean, signal?: AbortSignal): Promise<string> {
        if (!force) {
            cached ??= await store.read();
            if (cached !== null && cached.expiresAt - now() > TOKEN_REFRESH_MARGIN_MS) {
                return cached.accessToken;
            }
        }
        cached = await fetchToken(signal);
        return cached.accessToken;
    }
    async function send(
        endpoint: string,
        body: string,
        token: string,
        signal?: AbortSignal,
    ): Promise<Response> {
        await takeSlot();
        return doFetch(`${IGDB_BASE_URL}/${endpoint}`, {
            method: "POST",
            headers: {
                "Client-ID": options.clientId,
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                "Content-Type": "text/plain",
            },
            body,
            signal,
        });
    }
    return {
        async ensureToken(signal?: AbortSignal): Promise<void> {
            await currentToken(false, signal);
        },
        async query<T>(endpoint: string, apicalypse: string, signal?: AbortSignal): Promise<T> {
            let token = await currentToken(false, signal);
            let response = await send(endpoint, apicalypse, token, signal);
            if (response.status === 401) {
                token = await currentToken(true, signal);
                response = await send(endpoint, apicalypse, token, signal);
            }
            if (response.status === 429) {
                throw new MetadataProviderError(
                    "IGDB rate limit exceeded.",
                    IGDB_KEY,
                    429,
                    parseRetryAfter(response.headers.get("retry-after")) ?? DEFAULT_BACKOFF_MS,
                );
            }
            if (!response.ok) {
                const detail = (await response.text()).slice(0, 200);
                throw new MetadataProviderError(
                    `IGDB ${endpoint} failed with HTTP ${response.status}: ${detail}`,
                    IGDB_KEY,
                    response.status,
                );
            }
            return (await response.json()) as T;
        },
    };
}