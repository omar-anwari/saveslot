import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { SCAN_MODES, platforms } from "@/db/schema";
import { errorResponse } from "../errors";
import { env } from "@/lib/config/env";
import { ScanInProgressError } from "@/lib/scanning/scan-lock";
import { startScan } from "@/lib/scanning/scan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isScanMode(value: string): value is (typeof SCAN_MODES)[number] {
    return (SCAN_MODES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
    let body: unknown = {};
    if (request.headers.get("content-type")?.includes("application/json")) {
        body = await request.json().catch(() => ({}));
    }
    const input = (body ?? {}) as { mode?: unknown; platform?: unknown };
    const mode = typeof input.mode === "string" ? input.mode : "quick";
    if (!isScanMode(mode)) {
        return errorResponse(400, "BAD_REQUEST", "Unknown scan mode.", {
            supported: [...SCAN_MODES],
        });
    }
    let platformSlug: string | undefined;
    if (input.platform !== undefined) {
        if (typeof input.platform !== "string") {
            return errorResponse(400, "BAD_REQUEST", "Platform must be a string.");
        }
        const exists = db
            .select({ id: platforms.id })
            .from(platforms)
            .where(eq(platforms.slug, input.platform))
            .get();
        if (!exists) {
            return errorResponse(400, "BAD_REQUEST", "Unknown platform.");
        }
        platformSlug = input.platform;
    }
    try {
        const { scanRunId, completion } = startScan(db, {
            libraryRoot: env.romLibraryPath,
            mode,
            platformSlug,
            hashConcurrency: env.SCAN_CONCURRENCY,
            algorithms: env.scanHashAlgorithms,
        });
        completion.catch(() => undefined);
        return NextResponse.json(
            { scanRunId, mode, platform: platformSlug ?? null, status: "running" },
            { status: 202 },
        );
    } catch (error) {
        if (error instanceof ScanInProgressError) {
            return errorResponse(409, "CONFLICT", "A scan is already running.", {
                scanRunId: error.activeScanRunId,
            });
        }
        return errorResponse(500, "INTERNAL_ERROR", "Unable to start the scan.");
    }
}