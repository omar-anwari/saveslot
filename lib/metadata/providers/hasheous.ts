import { z } from "zod";
import { resolvePlatformSlug } from "../platform-map.ts";
import {
    nonEmpty,
    type ExternalId,
    type HashMatchInput,
    type HashMatchResult,
    type MatchReason,
    type MetadataCandidate,
    type MetadataProvider,
    type NormalizedGameMetadata,
    type ProviderHealth,
    type TitleSearchInput,
} from "../types.ts";

export const HASHEOUS_KEY = "hasheous";

export class MetadataProviderError extends Error {
    constructor(
        message: string,
        readonly providerKey: string,
        readonly status: number | null,
    ) {
        super(message);
        this.name = "MetadataProviderError";
    }
}

export interface HasheousOptions {
    baseUrl: string;
    timeoutMs: number;
    enabled: boolean;
    fetchImpl?: typeof fetch;
}

const LooseString = z
    .union([z.string(), z.number()])
    .transform((value) => String(value))
    .optional();

const MappingSchema = z.object({
    source: z.string().optional(),
    id: LooseString,
    status: z.string().optional(),
    matchMethod: z.string().optional(),
    link: z.string().optional(),
});

const StringMap = z.record(z.string(), z.string()).optional();
const ResponseSchema = z.object({
    id: z.number().optional(),
    name: z.string().optional(),
    platform: z
        .object({ name: z.string().optional(), metadata: z.array(MappingSchema).optional() })
        .optional(),
    publisher: z.object({ name: z.string().optional() }).optional(),
    metadata: z.array(MappingSchema).optional(),
    signature: z
        .object({
            game: z
                .object({
                    name: z.string().optional(),
                    sortingName: z.string().optional(),
                    description: z.string().optional(),
                    year: LooseString,
                    publisher: z.string().optional(),
                    countries: StringMap,
                    languages: StringMap,
                })
                .optional(),
            rom: z
                .object({
                    name: z.string().optional(),
                    size: z.number().optional(),
                    crc: z.string().optional(),
                    md5: z.string().optional(),
                    sha1: z.string().optional(),
                    country: StringMap,
                    language: StringMap,
                    signatureSource: z.string().optional(),
                })
                .optional(),
        })
        .optional(),
});

function mappingConfidence(matchMethod: string | undefined): ExternalId["confidence"] {
    if (matchMethod === "ManualByAdmin") return "verified";
    if (matchMethod === "Automatic") return "automatic";
    return "unknown";
}

function toExternalIds(mappings: readonly z.infer<typeof MappingSchema>[]): ExternalId[] {
    const ids: ExternalId[] = [];
    for (const mapping of mappings) {
        const source = nonEmpty(mapping.source);
        const id = nonEmpty(mapping.id);
        if (source === null || id === null || mapping.status !== "Mapped") continue;
        ids.push({ source, id, url: nonEmpty(mapping.link), confidence: mappingConfidence(mapping.matchMethod) });
    }
    return ids;
}

function igdbPlatformId(mappings: readonly z.infer<typeof MappingSchema>[]): number | null {
    for (const mapping of mappings) {
        if (mapping.source !== "IGDB" || mapping.status !== "Mapped") continue;
        const parsed = Number.parseInt(nonEmpty(mapping.id) ?? "", 10);
        if (Number.isInteger(parsed)) return parsed;
    }
    return null;
}

function toCodes(map: Record<string, string> | undefined, upper: boolean): string[] {
    if (map === undefined) return [];
    const codes: string[] = [];
    for (const [key, value] of Object.entries(map)) {
        if (key.length !== 2 || nonEmpty(value) === null) continue;
        codes.push(upper ? key.toUpperCase() : key.toLowerCase());
    }
    return [...new Set(codes)].sort();
}

function parseYear(value: string | null): number | null {
    const match = /\b(1[89]\d{2}|20\d{2})\b/.exec(value ?? "");
    if (match?.[1] === undefined) return null;
    return Number.parseInt(match[1], 10);
}

function sameHash(ours: string | null, theirs: string | undefined, width: number): boolean {
    const mine = nonEmpty(ours)?.toLowerCase().padStart(width, "0");
    const yours = nonEmpty(theirs)?.toLowerCase().padStart(width, "0");
    return mine !== undefined && mine !== null && mine === yours;
}

export function createHasheousProvider(options: HasheousOptions): MetadataProvider {
    const doFetch = options.fetchImpl ?? fetch;
    const endpoint = new URL("/api/v1/Lookup/ByHash", options.baseUrl).toString();
    async function post(body: unknown, signal: AbortSignal | undefined): Promise<Response> {
        const timeout = AbortSignal.timeout(options.timeoutMs);
        return doFetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
            signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
        });
    }
    return {
        key: HASHEOUS_KEY,
        isConfigured() {
            return options.enabled;
        },
        async healthCheck(signal?: AbortSignal): Promise<ProviderHealth> {
            const started = Date.now();
            try {
                const response = await post({ SHA1: "0".repeat(39) + "1" }, signal);
                const latencyMs = Date.now() - started;
                if (response.status === 404 || response.ok) {
                    return { ok: true, latencyMs, message: `Reachable (HTTP ${response.status}).` };
                }
                return { ok: false, latencyMs, message: `Unexpected HTTP ${response.status}.` };
            } catch (error) {
                return {
                    ok: false,
                    latencyMs: Date.now() - started,
                    message: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error.",
                };
            }
        },
        normalizeCached(payload: unknown, input: HashMatchInput): MetadataCandidate[] {
            if (payload === null || payload === undefined) return [];
            const parsed = ResponseSchema.safeParse(payload);
            if (!parsed.success) {
                throw new MetadataProviderError(
                    `Hasheous returned an unrecognized response: ${z.prettifyError(parsed.error)}`,
                    HASHEOUS_KEY,
                    null,
                );
            }
            const candidate = toCandidate(parsed.data, input);
            return candidate === null ? [] : [candidate];
        },
        async matchByHashes(input: HashMatchInput, signal?: AbortSignal): Promise<HashMatchResult> {
            const body: Record<string, string> = {};
            if (nonEmpty(input.sha1) !== null) body.SHA1 = input.sha1!;
            if (nonEmpty(input.md5) !== null) body.MD5 = input.md5!;
            if (nonEmpty(input.crc32) !== null) body.CRC = input.crc32!;
            if (Object.keys(body).length === 0) {
                return { status: "not_found", candidates: [], payload: null, latencyMs: 0 };
            }
            const started = Date.now();
            const response = await post(body, signal);
            const latencyMs = Date.now() - started;
            if (response.status === 404) {
                return { status: "not_found", candidates: [], payload: null, latencyMs };
            }
            if (!response.ok) {
                throw new MetadataProviderError(
                    `Hasheous lookup failed with HTTP ${response.status}.`,
                    HASHEOUS_KEY,
                    response.status,
                );
            }
            const payload: unknown = await response.json();
            return { status: "matched", candidates: this.normalizeCached(payload, input), payload, latencyMs };
        },
        searchByTitle(_input: TitleSearchInput): Promise<MetadataCandidate[]> {
            return Promise.resolve([]);
        },
        getGame(_providerGameId: string): Promise<NormalizedGameMetadata | null> {
            return Promise.resolve(null);
        },
    };
}

function toCandidate(
    data: z.infer<typeof ResponseSchema>,
    input: HashMatchInput,
): MetadataCandidate | null {
    const rom = data.signature?.rom;
    const game = data.signature?.game;
    const reasons: MatchReason[] = [];
    let score: number;
    if (sameHash(input.sha1, rom?.sha1, 40)) {
        score = 1;
        reasons.push({ code: "hash.sha1", delta: 1, detail: "SHA-1 matches the signature exactly." });
    } else if (sameHash(input.md5, rom?.md5, 32)) {
        score = 0.99;
        reasons.push({ code: "hash.md5", delta: 0.99, detail: "MD5 matches the signature exactly." });
    } else if (sameHash(input.crc32, rom?.crc, 8)) {
        score = 0.9;
        reasons.push({ code: "hash.crc32", delta: 0.9, detail: "CRC32 matches; CRC32 collisions are possible." });
    } else {
        score = 0.8;
        reasons.push({
            code: "hash.unverified",
            delta: 0.8,
            detail: "Provider reported a match but returned no hash we could confirm.",
        });
    }
    const platformSlug = resolvePlatformSlug(
        igdbPlatformId(data.platform?.metadata ?? []),
        nonEmpty(data.platform?.name),
    );
    if (platformSlug === null) {
        score = Math.min(score, 0.5);
        reasons.push({
            code: "platform.unknown",
            delta: -0.5,
            detail: `Unrecognized platform "${data.platform?.name ?? "unknown"}".`,
        });
    } else if (platformSlug !== input.platformSlug) {
        score = 0;
        reasons.push({
            code: "platform.mismatch",
            delta: -1,
            detail: `Provider says ${platformSlug}, file is in ${input.platformSlug}.`,
        });
    } else {
        reasons.push({ code: "platform.agree", delta: 0, detail: `Platform ${platformSlug} agrees.` });
    }
    if (input.fileSize !== null && rom?.size === input.fileSize) {
        reasons.push({ code: "size.agree", delta: 0, detail: `Size agrees at ${rom.size} bytes.` });
    }
    const title =
        nonEmpty(game?.name) ?? nonEmpty(data.name) ?? nonEmpty(rom?.name)?.replace(/\.[a-z0-9]+$/i, "");
    if (title === null || title === undefined) return null;
    const regions = toCodes(rom?.country, true);
    const languages = toCodes(game?.languages, false);
    const metadata: NormalizedGameMetadata = {
        title,
        sortTitle: nonEmpty(game?.sortingName),
        summary: nonEmpty(game?.description),
        releaseYear: parseYear(nonEmpty(game?.year)),
        developer: null,
        publisher: nonEmpty(game?.publisher) ?? nonEmpty(data.publisher?.name),
        genres: [],
        regions: regions.length > 0 ? regions : toCodes(game?.countries, true),
        languages,
        players: null,
        coverUrl: null,
        externalIds: toExternalIds(data.metadata ?? []),
    };
    return {
        providerKey: HASHEOUS_KEY,
        providerGameId: String(data.id ?? ""),
        score: Math.max(0, Math.min(1, score)),
        matchType: "hash",
        reasons,
        platformSlug,
        metadata,
    };
}