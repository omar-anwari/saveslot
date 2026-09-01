import { stat } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { gameFiles, games } from "@/db/schema";
import { errorResponse } from "@/app/api/errors";
import { env } from "@/lib/config/env";
import { resolveRealPathWithinRoot } from "@/lib/filesystem/paths";
import { buildFileResponse } from "@/lib/streaming/file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(
    request: Request,
    context: { params: Promise<{ slug: string }> },
    method: "GET" | "HEAD",
): Promise<Response> {
    const { slug } = await context.params;
    const record = db
        .select({
            relativePath: gameFiles.relativePath,
            fileName: gameFiles.fileName,
            sizeBytes: gameFiles.sizeBytes,
            modifiedAtFs: gameFiles.modifiedAtFs,
        })
        .from(gameFiles)
        .innerJoin(games, eq(gameFiles.gameId, games.id))
        .where(
            and(
                eq(games.slug, slug),
                eq(gameFiles.fileRole, "primary"),
                eq(gameFiles.present, true),
            ),
        )
        .get();
    if (!record) {
        return errorResponse(404, "NOT_FOUND", "No playable file for that game.");
    }
    let absolutePath: string;
    try {
        absolutePath = await resolveRealPathWithinRoot(
            env.romLibraryPath,
            record.relativePath,
        );
    } catch {
        return errorResponse(404, "NOT_FOUND", "The file could not be read.");
    }
    let stats;
    try {
        stats = await stat(absolutePath);
    } catch {
        return errorResponse(404, "NOT_FOUND", "The file could not be read.");
    }
    if (!stats.isFile()) {
        return errorResponse(404, "NOT_FOUND", "The file could not be read.");
    }
    const mtimeSeconds = Math.floor(stats.mtimeMs / 1000) * 1000;
    if (
        stats.size !== record.sizeBytes ||
        mtimeSeconds !== record.modifiedAtFs.getTime()
    ) {
        return errorResponse(
            409,
            "CONFLICT",
            "The file on disk no longer matches the catalogue. Run a scan.",
        );
    }
    return buildFileResponse({
        absolutePath,
        size: stats.size,
        modifiedAt: new Date(mtimeSeconds),
        downloadName: record.fileName,
        method,
        rangeHeader: request.headers.get("range"),
        ifNoneMatch: request.headers.get("if-none-match"),
    });
}

export async function GET(
    request: Request,
    context: { params: Promise<{ slug: string }> },
) {
    return handle(request, context, "GET");
}

export async function HEAD(
    request: Request,
    context: { params: Promise<{ slug: string }> },
) {
    return handle(request, context, "HEAD");
}