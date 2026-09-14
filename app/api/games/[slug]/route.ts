import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { errorResponse } from "../../errors";
import { getGameDetail } from "@/lib/games/query";
import { updateGame } from "@/lib/games/mutations";
import { env } from "@/lib/config/env";
import { gameIdForSlug } from "@/lib/games/metadata-edit";
import { removeGame } from "@/lib/games/removal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  favourite: z.boolean().optional(),
  hidden: z.boolean().optional(),
  playStatus: z
    .enum(["unplayed", "playing", "completed", "abandoned", "backlog"])
    .optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const game = getGameDetail(db, slug);
  if (!game) return errorResponse(404, "NOT_FOUND", "No game with that slug.");
  return NextResponse.json({ game });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return errorResponse(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Expected application/json.",
    );
  }
  const body: unknown = await request.json().catch(() => undefined);
  if (body === undefined) {
    return errorResponse(400, "BAD_REQUEST", "Request body is not valid JSON.");
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "BAD_REQUEST", "Invalid game update.", {
      issues: z.prettifyError(parsed.error),
    });
  }
  const game = updateGame(db, slug, parsed.data);
  if (!game) return errorResponse(404, "NOT_FOUND", "No game with that slug.");
  return NextResponse.json({ game });
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ slug: string }> },
) {
    const { slug } = await context.params;
    const force = new URL(request.url).searchParams.get("force") === "true";
    const gameId = gameIdForSlug(db, slug);
    if (gameId === null) return errorResponse(404, "NOT_FOUND", "No game with that slug.");
    const result = await removeGame(db, gameId, { dataRoot: env.appDataPath, force });
    if (result.outcome === "not-found") {
        return errorResponse(404, "NOT_FOUND", "No game with that slug.");
    }
    if (result.outcome === "blocked") {
        return errorResponse(409, "CONFLICT", result.reason ?? "Refused.", {
            presentFiles: result.game?.presentFiles ?? 0,
            saves: result.game?.saves ?? 0,
            states: result.game?.states ?? 0,
        });
    }
    return NextResponse.json({ removed: result.game, deletedBlobs: result.deletedBlobs });
}