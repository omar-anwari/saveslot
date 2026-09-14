import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { errorResponse } from "../../../../errors";
import { getGameDetail } from "@/lib/games/query";
import { configuredProviders } from "@/lib/metadata/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SearchSchema = z.object({
    query: z.string().trim().min(2).max(200).optional(),
});

export async function POST(
    request: Request,
    context: { params: Promise<{ slug: string }> },
) {
    const { slug } = await context.params;
    if (!request.headers.get("content-type")?.includes("application/json")) {
        return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json.");
    }
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = SearchSchema.safeParse(body ?? {});
    if (!parsed.success) {
        return errorResponse(400, "BAD_REQUEST", "Invalid search.", {
            issues: z.prettifyError(parsed.error),
        });
    }
    const game = getGameDetail(db, slug);
    if (!game) return errorResponse(404, "NOT_FOUND", "No game with that slug.");

    const { enricher } = await configuredProviders();
    if (enricher === null) {
        return errorResponse(400, "AUTH_DISABLED", "No metadata provider is configured.");
    }
    const candidates = await enricher.searchByTitle({
        query: undefined,
        title: parsed.data.query ?? game.title,
        platformSlug: game.platform.slug,
        releaseYear: game.releaseYear,
        limit: 10,
    } as never);
    return NextResponse.json({
        provider: enricher.key,
        query: parsed.data.query ?? game.title,
        results: candidates.map((candidate) => ({
            providerGameId: candidate.providerGameId,
            title: candidate.metadata.title,
            score: candidate.score,
            releaseYear: candidate.metadata.releaseYear,
            publisher: candidate.metadata.publisher,
            summary: candidate.metadata.summary,
            coverUrl: candidate.metadata.coverUrl,
            platformSlugs: candidate.metadata.platformSlugs,
            url: candidate.metadata.externalIds[0]?.url ?? null,
        })),
    });
}