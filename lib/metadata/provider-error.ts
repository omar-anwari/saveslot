export class MetadataProviderError extends Error {
    readonly providerKey: string;
    readonly status: number | null;
    readonly retryAfterMs: number | null;

    constructor(
        message: string,
        providerKey: string,
        status: number | null,
        retryAfterMs: number | null = null,
    ) {
        super(message);
        this.name = "MetadataProviderError";
        this.providerKey = providerKey;
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

export const DEFAULT_BACKOFF_MS = 60_000;

export function parseRetryAfter(header: string | null): number | null {
    if (header === null) return null;
    const trimmed = header.trim();
    const seconds = Number.parseInt(trimmed, 10);
    if (String(seconds) === trimmed && seconds >= 0) return seconds * 1000;
    const at = Date.parse(trimmed);
    if (Number.isNaN(at)) return null;
    return Math.max(0, at - Date.now());
}