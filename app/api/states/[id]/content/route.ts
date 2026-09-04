import { stat } from "node:fs/promises";
import { db } from "@/db/client";
import { errorResponse } from "@/app/api/errors";
import { env } from "@/lib/config/env";
import { resolveRealPathWithinRoot } from "@/lib/filesystem/paths";
import { getSaveState } from "@/lib/saves/states";
import { buildFileResponse } from "@/lib/streaming/file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(
  request: Request,
  context: { params: Promise<{ id: string }> },
  method: "GET" | "HEAD",
): Promise<Response> {
  const { id } = await context.params;
  const state = getSaveState(db, id);
  if (!state) return errorResponse(404, "NOT_FOUND", "No state with that id.");
  let absolutePath: string;
  try {
    absolutePath = await resolveRealPathWithinRoot(
      env.appDataPath,
      state.localRelativePath,
    );
  } catch {
    return errorResponse(404, "NOT_FOUND", "The state file could not be read.");
  }
  let stats;
  try {
    stats = await stat(absolutePath);
  } catch {
    return errorResponse(404, "NOT_FOUND", "The state file could not be read.");
  }
  return buildFileResponse({
    absolutePath,
    size: stats.size,
    modifiedAt: new Date(Math.floor(stats.mtimeMs / 1000) * 1000),
    downloadName: `${state.coreKey}-${state.id}.state`,
    method,
    rangeHeader: request.headers.get("range"),
    ifNoneMatch: request.headers.get("if-none-match"),
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(request, context, "GET");
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(request, context, "HEAD");
}