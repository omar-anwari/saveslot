import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { games, platforms } from "@/db/schema";
import { errorResponse } from "@/app/api/errors";
import {
    HEARTBEAT_INTERVAL_SECONDS,
    reapStaleSessions,
    startSession,
} from "@/lib/sessions/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const StartSchema = z.object({
    core: z.string().min(1),
    clientId: z.string().min(8).max(64),
});

export async function POST(
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
    const body: unknown = await request.json().catch(() => undefined);
    const parsed = StartSchema.safeParse(body);
    if (!parsed.success) {
        return errorResponse(400, "BAD_REQUEST", "Invalid session request.", {
            issues: z.prettifyError(parsed.error),
        });
    }
    if (parsed.data.core !== game.core) {
        return errorResponse(400, "BAD_REQUEST", "Unknown core for this platform.");
    }
    reapStaleSessions(db);
    const sessionId = startSession(db, {
        gameId: game.id,
        coreKey: parsed.data.core,
        clientId: parsed.data.clientId,
    });

    return NextResponse.json(
        { sessionId, heartbeatSeconds: HEARTBEAT_INTERVAL_SECONDS },
        { status: 201 },
    );
}