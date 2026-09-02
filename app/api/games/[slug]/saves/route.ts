import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { games, platforms } from "@/db/schema";
import { errorResponse } from "@/app/api/errors";
import { serializeSave } from "@/lib/api/serialize";
import { env } from "@/lib/config/env";
import {
    EmptySaveError,
    PayloadTooLargeError,
    listSaves,
    storeSave,
    writeUploadToTemp,
} from "@/lib/saves/storage";
import { rm } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;
const SLOT_PATTERN = /^[a-z0-9_-]{1,32}$/i;
const SOURCES = ["emulator", "upload", "import", "backup"] as const;

function lookupGame(slug: string) {
    return db
        .select({
            id: games.id,
            core: platforms.emulatorCore,
            platformName: platforms.name,
        })
        .from(games)
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .where(eq(games.slug, slug))
        .get();
}

async function* streamBytes(
    body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
    const reader = body.getReader();
    try {
        for (; ;) {
            const { done, value } = await reader.read();
            if (done) return;
            if (value) yield value;
        }
    } finally {
        reader.releaseLock();
    }
}

export async function GET(
    request: Request,
    context: { params: Promise<{ slug: string }> },
) {
    const { slug } = await context.params;
    const game = lookupGame(slug);
    if (!game) return errorResponse(404, "NOT_FOUND", "No game with that slug.");
    const core = new URL(request.url).searchParams.get("core") ?? undefined;
    return NextResponse.json({
        saves: listSaves(db, game.id, core).map(serializeSave),
    });
}

export async function POST(
    request: Request,
    context: { params: Promise<{ slug: string }> },
) {
    const { slug } = await context.params;
    const game = lookupGame(slug);
    if (!game) return errorResponse(404, "NOT_FOUND", "No game with that slug.");
    if (!request.headers.get("content-type")?.includes("application/octet-stream")) {
        return errorResponse(
            415,
            "UNSUPPORTED_MEDIA_TYPE",
            "Send the save as application/octet-stream.",
        );
    }
    if (!request.body) {
        return errorResponse(400, "BAD_REQUEST", "Request body is empty.");
    }
    const params = new URL(request.url).searchParams;
    const core = params.get("core");
    if (!core || core !== game.core) {
        return errorResponse(400, "BAD_REQUEST", "Unknown core for this platform.", {
            expected: game.core,
        });
    }
    const slot = params.get("slot") ?? "main";
    if (!SLOT_PATTERN.test(slot)) {
        return errorResponse(400, "BAD_REQUEST", "Invalid slot name.");
    }
    const fileExtension = (params.get("ext") ?? "srm").toLowerCase();
    if (!EXTENSION_PATTERN.test(fileExtension)) {
        return errorResponse(400, "BAD_REQUEST", "Invalid save file extension.");
    }
    const sourceParam = params.get("source") ?? "emulator";
    if (!(SOURCES as readonly string[]).includes(sourceParam)) {
        return errorResponse(400, "BAD_REQUEST", "Unknown save source.", {
            supported: [...SOURCES],
        });
    }
    const source = sourceParam as (typeof SOURCES)[number];
    try {
        const upload = await writeUploadToTemp(
            env.appDataPath,
            streamBytes(request.body),
            env.MAX_SAVE_BYTES,
        );
        const claimed = params.get("checksum");
        if (claimed && claimed.toLowerCase() !== upload.checksumSha256) {
            await rm(upload.tempPath, { force: true });
            return errorResponse(
                400,
                "BAD_REQUEST",
                "Checksum mismatch; the upload was corrupted in transit.",
            );
        }
        const result = await storeSave({
            db,
            dataRoot: env.appDataPath,
            gameId: game.id,
            coreKey: core,
            slot,
            fileExtension,
            upload,
            source,
            historyLimit: env.SAVE_HISTORY_LIMIT,
            baseChecksum: params.get("baseChecksum"),
        });
        if (result.status === "conflict") {
            return NextResponse.json(result, { status: 409 });
        }
        return NextResponse.json(result, {
            status: result.status === "stored" ? 201 : 200,
        });
    } catch (error) {
        if (error instanceof PayloadTooLargeError) {
            return errorResponse(413, "PAYLOAD_TOO_LARGE", "The save is too large.", {
                maxBytes: env.MAX_SAVE_BYTES,
            });
        }
        if (error instanceof EmptySaveError) {
            return errorResponse(400, "BAD_REQUEST", "The save contained no data.");
        }
        return errorResponse(500, "INTERNAL_ERROR", "The save could not be stored.");
    }
}