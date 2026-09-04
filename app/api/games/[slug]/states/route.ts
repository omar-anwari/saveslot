import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { games, platforms } from "@/db/schema";
import { errorResponse } from "@/app/api/errors";
import { serializeSaveState } from "@/lib/api/serialize";
import { env } from "@/lib/config/env";
import { listStates, storeState } from "@/lib/saves/states";
import {
    EmptySaveError,
    PayloadTooLargeError,
    writeUploadToTemp,
} from "@/lib/saves/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTOSAVE_LIMIT = 3;
const SLOT_PATTERN = /^[a-z0-9_-]{1,32}$/i;
const MAX_LABEL_LENGTH = 120;
function lookupGame(slug: string) {
    return db
        .select({ id: games.id, core: platforms.emulatorCore })
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
    const params = new URL(request.url).searchParams;
    const core = params.get("core") ?? game.core ?? undefined;
    const all = params.get("all") === "true";
    return NextResponse.json({
        states: listStates(db, game.id, all ? undefined : core).map(
            serializeSaveState,
        ),
        filteredByCore: all ? null : (core ?? null),
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
            "Send the state as application/octet-stream.",
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
    const slot = params.get("slot");
    if (slot !== null && !SLOT_PATTERN.test(slot)) {
        return errorResponse(400, "BAD_REQUEST", "Invalid slot name.");
    }
    const label = params.get("label");
    if (label !== null && label.length > MAX_LABEL_LENGTH) {
        return errorResponse(400, "BAD_REQUEST", "Label is too long.", {
            maxLength: MAX_LABEL_LENGTH,
        });
    }
    try {
        const upload = await writeUploadToTemp(
            env.appDataPath,
            streamBytes(request.body),
            env.MAX_STATE_BYTES,
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
        const stateId = await storeState({
            db,
            dataRoot: env.appDataPath,
            gameId: game.id,
            coreKey: core,
            coreVersion: params.get("coreVersion"),
            slot,
            label,
            isAutosave: params.get("autosave") === "true",
            upload,
            manualLimit: env.STATE_HISTORY_LIMIT,
            autosaveLimit: AUTOSAVE_LIMIT,
        });
        return NextResponse.json({ stateId }, { status: 201 });
    } catch (error) {
        if (error instanceof PayloadTooLargeError) {
            return errorResponse(413, "PAYLOAD_TOO_LARGE", "The state is too large.", {
                maxBytes: env.MAX_STATE_BYTES,
            });
        }
        if (error instanceof EmptySaveError) {
            return errorResponse(400, "BAD_REQUEST", "The state contained no data.");
        }
        return errorResponse(500, "INTERNAL_ERROR", "The state could not be stored.");
    }
}