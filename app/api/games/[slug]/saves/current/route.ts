import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { games, platforms } from "@/db/schema";
import { errorResponse } from "@/app/api/errors";
import { serializeSave } from "@/lib/api/serialize";
import { currentSave } from "@/lib/saves/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    context: { params: Promise<{ slug: string }> },
) {
    const { slug } = await context.params;
    const game = db
        .select({ id: games.id, core: platforms.emulatorCore })
        .from(games)
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .where(eq(games.slug, slug))
        .get();
    if (!game) return errorResponse(404, "NOT_FOUND", "No game with that slug.");
    const params = new URL(request.url).searchParams;
    const core = params.get("core") ?? game.core;
    const slot = params.get("slot") ?? "main";
    if (!core) {
        return errorResponse(400, "BAD_REQUEST", "No core configured or supplied.");
    }
    const save = currentSave(db, game.id, core, slot);
    return NextResponse.json({ save: save ? serializeSave(save) : null });
}