import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { errorResponse } from "@/app/api/errors";
import { serializeSaveState } from "@/lib/api/serialize";
import { env } from "@/lib/config/env";
import {
  deleteSaveState,
  getSaveState,
  updateSaveState,
} from "@/lib/saves/states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  slot: z.string().regex(/^[a-z0-9_-]{1,32}$/i).nullable().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const state = getSaveState(db, id);
  if (!state) return errorResponse(404, "NOT_FOUND", "No state with that id.");
  return NextResponse.json({ state: serializeSaveState(state) });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

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
    return errorResponse(400, "BAD_REQUEST", "Invalid state update.", {
      issues: z.prettifyError(parsed.error),
    });
  }

  const state = updateSaveState(db, id, parsed.data);
  if (!state) return errorResponse(404, "NOT_FOUND", "No state with that id.");

  return NextResponse.json({ state: serializeSaveState(state) });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const removed = await deleteSaveState(db, env.appDataPath, id);
  if (!removed) return errorResponse(404, "NOT_FOUND", "No state with that id.");
  return NextResponse.json({ deletedId: id });
}