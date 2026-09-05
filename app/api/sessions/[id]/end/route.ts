import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { EXIT_REASONS } from "@/db/schema";
import { errorResponse } from "@/app/api/errors";
import { endSession, type ExitReason } from "@/lib/sessions/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isExitReason(value: string): value is ExitReason {
    return (EXIT_REASONS as readonly string[]).includes(value);
}

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    const { id } = await context.params;
    const raw = new URL(request.url).searchParams.get("reason") ?? "unknown";
    const reason: ExitReason = isExitReason(raw) ? raw : "unknown";
    const session = endSession(db, id, reason);
    if (!session) {
        return errorResponse(404, "NOT_FOUND", "No session with that id.");
    }
    return NextResponse.json({
        sessionId: session.id,
        durationSeconds: session.durationSeconds,
        exitReason: session.exitReason,
    });
}