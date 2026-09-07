import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { MIME_BY_FORMAT, sniffImageFormat, type ImageFormat } from "./image-type.ts";
import { UnsafeUrlError, assertAllowedUrl, isBlockedAddress } from "./url-guard.ts";

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_REDIRECTS = 3;

export type FetchFailure =
    | "http-error"
    | "too-large"
    | "too-many-redirects"
    | "no-location"
    | "not-an-image"
    | "empty";

export class ArtworkFetchError extends Error {
    readonly code: FetchFailure;
    readonly url: string;

    constructor(message: string, code: FetchFailure, url: string) {
        super(message);
        this.name = "ArtworkFetchError";
        this.code = code;
        this.url = url;
    }
}

export interface ResolvedAddress {
    address: string;
}

export interface FetchImageOptions {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    allowedHosts?: readonly string[];
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    lookupImpl?: (hostname: string) => Promise<readonly ResolvedAddress[]>;
}

export interface FetchedImage {
    bytes: Uint8Array;
    format: ImageFormat;
    contentType: string;
    finalUrl: string;
}

function isRedirect(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function assertResolvesPublicly(
    url: URL,
    resolve: (hostname: string) => Promise<readonly ResolvedAddress[]>,
): Promise<void> {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(hostname) !== 0) return;

    let addresses: readonly ResolvedAddress[];
    try {
        addresses = await resolve(hostname);
    } catch {
        throw new UnsafeUrlError(`Could not resolve ${hostname}.`, url.toString());
    }
    if (addresses.length === 0) {
        throw new UnsafeUrlError(`${hostname} resolved to nothing.`, url.toString());
    }
    for (const { address } of addresses) {
        if (isBlockedAddress(address)) {
            throw new UnsafeUrlError(
                `${hostname} resolves to ${address}, which is not a public host.`,
                url.toString(),
            );
        }
    }
}

async function readCapped(response: Response, maxBytes: number, url: string): Promise<Uint8Array> {
    if (response.body === null) throw new ArtworkFetchError("Empty response body.", "empty", url);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (; ;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value === undefined) continue;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel();
                throw new ArtworkFetchError(`Image exceeds ${maxBytes} bytes.`, "too-large", url);
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    if (total === 0) throw new ArtworkFetchError("Empty response body.", "empty", url);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

export async function fetchImage(
    rawUrl: string,
    options: FetchImageOptions = {},
): Promise<FetchedImage> {
    const doFetch = options.fetchImpl ?? fetch;
    const resolve =
        options.lookupImpl ?? ((hostname: string) => lookup(hostname, { all: true, verbatim: true }));
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const signal = options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]);
    let current = rawUrl;
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
        const url = assertAllowedUrl(current, { allowedHosts: options.allowedHosts });
        await assertResolvesPublicly(url, resolve);
        const response = await doFetch(url.toString(), {
            redirect: "manual",
            signal,
            headers: { accept: "image/*" },
        });
        if (isRedirect(response.status)) {
            const location = response.headers.get("location");
            if (location === null) {
                throw new ArtworkFetchError(
                    `HTTP ${response.status} with no Location header.`,
                    "no-location",
                    url.toString(),
                );
            }
            current = new URL(location, url).toString();
            continue;
        }
        if (!response.ok) {
            throw new ArtworkFetchError(`HTTP ${response.status}.`, "http-error", url.toString());
        }
        const declared = Number(response.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > maxBytes) {
            throw new ArtworkFetchError(
                `Declared length ${declared} exceeds ${maxBytes} bytes.`,
                "too-large",
                url.toString(),
            );
        }
        const bytes = await readCapped(response, maxBytes, url.toString());
        const format = sniffImageFormat(bytes);
        if (format === null) {
            throw new ArtworkFetchError(
                "Response is not a recognized image.",
                "not-an-image",
                url.toString(),
            );
        }
        return { bytes, format, contentType: MIME_BY_FORMAT[format], finalUrl: url.toString() };
    }
    throw new ArtworkFetchError(
        `More than ${maxRedirects} redirects.`,
        "too-many-redirects",
        rawUrl,
    );
}