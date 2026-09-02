import { stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { games, saves } from "@/db/schema";
import { errorResponse } from "@/app/api/errors";
import { env } from "@/lib/config/env";
import { resolveRealPathWithinRoot } from "@/lib/filesystem/paths";
import { buildFileResponse } from "@/lib/streaming/file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(
    request: Request,
    context: { params: Promise<{ id: string }> },
    method: "GET" | "HEAD",
): Promise<Response> {
    const { id } = await context.params;
    const saveId = Number.parseInt(id, 10);
    if (!Number.isInteger(saveId)) {
        return errorResponse(400, "BAD_REQUEST", "Invalid save id.");
    }
    const record = db
        .select({
            localRelativePath: saves.localRelativePath,
            fileExtension: saves.fileExtension,
            gameSlug: games.slug,
        })
        .from(saves)
        .innerJoin(games, eq(saves.gameId, games.id))
        .where(eq(saves.id, saveId))
        .get();
    if (!record) return errorResponse(404, "NOT_FOUND", "No save with that id.");
    let absolutePath: string;
    try {
        absolutePath = await resolveRealPathWithinRoot(
            env.appDataPath,
            record.localRelativePath,
        );
    } catch {
        return errorResponse(404, "NOT_FOUND", "The save file could not be read.");
    }
    let stats;
    try {
        stats = await stat(absolutePath);
    } catch {
        return errorResponse(404, "NOT_FOUND", "The save file could not be read.");
    }
    return buildFileResponse({
        absolutePath,
        size: stats.size,
        modifiedAt: new Date(Math.floor(stats.mtimeMs / 1000) * 1000),
        downloadName: `${record.gameSlug}.${record.fileExtension}`,
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