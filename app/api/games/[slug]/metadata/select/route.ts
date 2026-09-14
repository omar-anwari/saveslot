import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { errorResponse } from "../../../../errors";
import { getGameDetail } from "@/lib/games/query";
import { gameIdForSlug, selectCandidate } from "@/lib/games/metadata-edit";
import { refreshCoverArt } from "@/lib/artwork/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SelectSchema = z.object({
    providerKey: z.string().trim().min(1).max(50),
    providerGameId: z.string().trim().max(200),
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
    if (body === undefined) {
        return errorResponse(400, "BAD_REQUEST", "Request body is not valid JSON.");
    }
    const parsed = SelectSchema.safeParse(body);
    if (!parsed.success) {
        return errorResponse(400, "BAD_REQUEST", "Invalid candidate selection.", {
            issues: z.prettifyError(parsed.error),
        });
    }
    const gameId = gameIdForSlug(db, slug);
    if (gameId === null) return errorResponse(404, "NOT_FOUND", "No game with that slug.");
    const selected = selectCandidate(db, gameId, parsed.data.providerKey, parsed.data.providerGameId);
    if (selected === null) {
        return errorResponse(404, "NOT_FOUND", "This game has no such candidate.");
    }
    const cover = await refreshCoverArt(db, gameId);
    return NextResponse.json({ game: getGameDetail(db, slug), cover });
}