import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { errorResponse } from "@/app/api/errors";
import { heartbeat } from "@/lib/sessions/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
    _request: Request,
    context: { params: Promise<{ id: string }> },
) {
    const { id } = await context.params;
    const result = heartbeat(db, id);
    if (!result) {
        return errorResponse(404, "NOT_FOUND", "No active session with that id.");
    }
    return NextResponse.json(result);
}