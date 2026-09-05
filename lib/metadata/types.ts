export interface ExternalId {
    source: string;
    id: string;
    url: string | null;
    confidence: "verified" | "automatic" | "unknown";
}

export interface NormalizedGameMetadata {
    title: string;
    sortTitle: string | null;
    summary: string | null;
    releaseYear: number | null;
    developer: string | null;
    publisher: string | null;
    genres: readonly string[];
    regions: readonly string[];
    languages: readonly string[];
    players: number | null;
    coverUrl: string | null;
    externalIds: readonly ExternalId[];
}

export interface MatchReason {
    code: string;
    delta: number;
    detail: string;
}

export interface MetadataCandidate {
    providerKey: string;
    providerGameId: string;
    score: number;
    matchType: "hash" | "title";
    reasons: readonly MatchReason[];
    platformSlug: string | null;
    metadata: NormalizedGameMetadata;
}

export interface HashMatchInput {
    crc32: string | null;
    md5: string | null;
    sha1: string | null;
    platformSlug: string;
    fileSize: number | null;
}

export interface TitleSearchInput {
    title: string;
    platformSlug: string;
    releaseYear: number | null;
    limit: number;
}

export interface HashMatchResult {
    status: "matched" | "not_found";
    candidates: readonly MetadataCandidate[];
    payload: unknown;
    latencyMs: number;
}

export interface ProviderHealth {
    ok: boolean;
    latencyMs: number | null;
    message: string;
}

export interface MetadataProvider {
    readonly key: string;
    isConfigured(): boolean | Promise<boolean>;
    healthCheck(signal?: AbortSignal): Promise<ProviderHealth>;
    matchByHashes(
        input: HashMatchInput,
        signal?: AbortSignal,
    ): Promise<HashMatchResult>;
    normalizeCached(payload: unknown, input: HashMatchInput): MetadataCandidate[];
    searchByTitle(
        input: TitleSearchInput,
        signal?: AbortSignal,
    ): Promise<MetadataCandidate[]>;
    getGame(providerGameId: string, signal?: AbortSignal): Promise<NormalizedGameMetadata | null>;
}

export function nonEmpty(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}