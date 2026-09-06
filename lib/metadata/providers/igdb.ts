import { z } from "zod";
import { resolvePlatformSlug } from "../platform-map.ts";
import { MetadataProviderError } from "../provider-error.ts";
import {
    nonEmpty,
    type HashMatchInput,
    type HashMatchResult,
    type MetadataCandidate,
    type MetadataProvider,
    type NormalizedGameMetadata,
    type ProviderHealth,
    type TitleSearchInput,
} from "../types.ts";
import { IGDB_KEY, type IgdbClient } from "./igdb-client.ts";
import { enrichmentCandidate } from "../candidate.ts";

export { IGDB_KEY };
export const GAME_FIELDS = [
    "name",
    "slug",
    "summary",
    "first_release_date",
    "total_rating",
    "total_rating_count",
    "genres.name",
    "game_modes.id",
    "game_modes.name",
    "platforms.id",
    "platforms.name",
    "involved_companies.developer",
    "involved_companies.publisher",
    "involved_companies.company.name",
    "cover.image_id",
].join(", ");

const IMAGE_BASE = "https://images.igdb.com/igdb/image/upload";

export function coverUrlFor(imageId: string, size = "t_cover_big"): string {
    return `${IMAGE_BASE}/${size}/${imageId}.jpg`;
}

const GameSchema = z.object({
    id: z.number(),
    name: z.string().optional(),
    slug: z.string().optional(),
    summary: z.string().optional(),
    first_release_date: z.number().optional(),
    total_rating: z.number().optional(),
    genres: z.array(z.object({ name: z.string().optional() })).optional(),
    game_modes: z.array(z.object({ name: z.string().optional() })).optional(),
    platforms: z.array(z.object({ id: z.number(), name: z.string().optional() })).optional(),
    involved_companies: z
        .array(
            z.object({
                developer: z.boolean().optional(),
                publisher: z.boolean().optional(),
                company: z.object({ name: z.string().optional() }).optional(),
            }),
        )
        .optional(),
    cover: z.object({ image_id: z.string().optional() }).optional(),
});

type IgdbGame = z.infer<typeof GameSchema>;

export function normalizeIgdbGame(raw: unknown): NormalizedGameMetadata | null {
    const parsed = GameSchema.safeParse(raw);
    if (!parsed.success) {
        throw new MetadataProviderError(
            `IGDB returned an unrecognized game: ${z.prettifyError(parsed.error)}`,
            IGDB_KEY,
            null,
        );
    }
    const game: IgdbGame = parsed.data;
    const title = nonEmpty(game.name);
    if (title === null) return null;
    const companies = game.involved_companies ?? [];
    const developer =
        nonEmpty(companies.find((entry) => entry.developer === true)?.company?.name);
    const publisher =
        nonEmpty(companies.find((entry) => entry.publisher === true)?.company?.name);
    const modes = (game.game_modes ?? []).flatMap((mode) => nonEmpty(mode.name) ?? []);
    const players = modes.length === 1 && modes[0] === "Single player" ? 1 : null;
    const platformSlugs = [
        ...new Set(
            (game.platforms ?? []).flatMap((platform) =>
                resolvePlatformSlug(platform.id, nonEmpty(platform.name)) ?? [],
            ),
        ),
    ].sort();
    const imageId = nonEmpty(game.cover?.image_id);
    const slug = nonEmpty(game.slug);
    return {
        title,
        sortTitle: null,
        summary: nonEmpty(game.summary),
        releaseYear:
            game.first_release_date === undefined
                ? null
                : new Date(game.first_release_date * 1000).getUTCFullYear(),
        developer,
        publisher,
        genres: (game.genres ?? []).flatMap((genre) => nonEmpty(genre.name) ?? []),
        regions: [],
        languages: [],
        players,
        rating: game.total_rating ?? null,
        platformSlugs,
        coverUrl: imageId === null ? null : coverUrlFor(imageId),
        externalIds: [
            {
                source: "IGDB",
                id: String(game.id),
                url: slug === null ? null : `https://www.igdb.com/games/${slug}`,
                confidence: "verified",
            },
        ],
    };
}

export interface IgdbOptions {
    client: IgdbClient;
    enabled: boolean;
}

export function createIgdbProvider(options: IgdbOptions): MetadataProvider {
    return {
        key: IGDB_KEY,
        isConfigured() {
            return options.enabled;
        },
        async healthCheck(signal?: AbortSignal): Promise<ProviderHealth> {
            const started = Date.now();
            try {
                await options.client.query<unknown[]>("games", "fields id; where id = 1025;", signal);
                return { ok: true, latencyMs: Date.now() - started, message: "Reachable." };
            } catch (error) {
                return {
                    ok: false,
                    latencyMs: Date.now() - started,
                    message: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error.",
                };
            }
        },
        matchByHashes(_input: HashMatchInput): Promise<HashMatchResult> {
            return Promise.resolve({ status: "not_found", candidates: [], payload: null, latencyMs: 0 });
        },
        normalizeCached(payload: unknown, input: HashMatchInput): MetadataCandidate[] {
            if (!Array.isArray(payload) || payload.length === 0) return [];
            const metadata = normalizeIgdbGame(payload[0]);
            if (metadata === null) return [];
            return [candidateFor(metadata, input.platformSlug)];
        },
        searchByTitle(_input: TitleSearchInput): Promise<MetadataCandidate[]> {
            return Promise.resolve([]);
        },
        async getGame(providerGameId: string, signal?: AbortSignal): Promise<NormalizedGameMetadata | null> {
            if (!/^[0-9]{1,12}$/.test(providerGameId)) return null;
            const rows = await options.client.query<unknown[]>(
                "games",
                `fields ${GAME_FIELDS}; where id = ${providerGameId}; limit 1;`,
                signal,
            );
            const first = rows[0];
            return first === undefined ? null : normalizeIgdbGame(first);
        },
    };
}

export function candidateFor(
    metadata: NormalizedGameMetadata,
    wantedPlatformSlug: string,
): MetadataCandidate {
    return enrichmentCandidate({
        providerKey: IGDB_KEY,
        providerGameId: metadata.externalIds.find((entry) => entry.source === "IGDB")?.id ?? "",
        metadata,
        platformSlug: wantedPlatformSlug,
        inheritedScore: 0.95,
        identityProviderKey: IGDB_KEY,
        identityDetail: "Matched directly against IGDB.",
    });
}