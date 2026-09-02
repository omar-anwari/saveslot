import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { errorResponse } from "@/app/api/errors";
import { serializeSave } from "@/lib/api/serialize";
import { env } from "@/lib/config/env";
import { deleteSave, getSave } from "@/lib/saves/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(value: string): number | null {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
) {
    const { id } = await context.params;
    const saveId = parseId(id);
    if (saveId === null) {
        return errorResponse(400, "BAD_REQUEST", "Invalid save id.");
    }
    const save = getSave(db, saveId);
    if (!save) return errorResponse(404, "NOT_FOUND", "No save with that id.");
    return NextResponse.json({ save: serializeSave(save) });
}

export async function DELETE(
    _request: Request,
    context: { params: Promise<{ id: string }> },
) {
    const { id } = await context.params;
    const saveId = parseId(id);
    if (saveId === null) {
        return errorResponse(400, "BAD_REQUEST", "Invalid save id.");
    }
    const result = await deleteSave(db, env.appDataPath, saveId);
    if (!result) return errorResponse(404, "NOT_FOUND", "No save with that id.");
    return NextResponse.json(result);
}