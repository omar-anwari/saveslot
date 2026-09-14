import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { errorResponse } from "../../../../errors";
import { getGameDetail } from "@/lib/games/query";
import { gameIdForSlug } from "@/lib/games/metadata-edit";
import { enrichGame } from "@/lib/metadata/enrich-service";
import { configuredProviders } from "@/lib/metadata/providers";
import { refreshCoverArt } from "@/lib/artwork/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ApplySchema = z.object({
    providerGameId: z.string().trim().regex(/^[0-9]{1,12}$/),
});

export async function POST(
    request: Request,
    context: { params: Promise<{ slug: string }> },
) {
    const { slug } = await context.params;
    if (!request.headers.get("content-type")?.includes("application/json")) {
        return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json.");
    }
    const body: unknown = await request.json().catch(() => undefined);
    const parsed = ApplySchema.safeParse(body);
    if (!parsed.success) {
        return errorResponse(400, "BAD_REQUEST", "A numeric provider id is required.");
    }
    const gameId = gameIdForSlug(db, slug);
    if (gameId === null) return errorResponse(404, "NOT_FOUND", "No game with that slug.");
    const { enricher } = await configuredProviders();
    if (enricher === null) {
        return errorResponse(400, "AUTH_DISABLED", "No metadata provider is configured.");
    }
    const result = await enrichGame(db, gameId, {
        provider: enricher,
        forceExternalId: parsed.data.providerGameId,
    });
    if (result.outcome === "error" || result.outcome === "not_found") {
        return errorResponse(502, "INTERNAL_ERROR", result.message ?? "The provider could not be read.");
    }
    const cover = await refreshCoverArt(db, gameId);
    return NextResponse.json({ game: getGameDetail(db, slug), cover });
}