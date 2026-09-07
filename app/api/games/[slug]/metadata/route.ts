import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { errorResponse } from "../../../errors";
import { getGameDetail } from "@/lib/games/query";
import {
    EDITABLE_FIELDS,
    gameIdForSlug,
    revertFields,
    updateManualMetadata,
} from "@/lib/games/metadata-edit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nullableText = (max: number) =>
    z
        .string()
        .trim()
        .max(max)
        .nullable()
        .optional()
        .transform((value) => (value === "" ? null : value));

const EditsSchema = z.object({
    title: z.string().trim().min(1).max(300).optional(),
    sortTitle: z.string().trim().min(1).max(300).optional(),
    summary: nullableText(5000),
    releaseYear: z.number().int().min(1950).max(2100).nullable().optional(),
    developer: nullableText(200),
    publisher: nullableText(200),
    genres: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
    players: z.number().int().min(1).max(64).nullable().optional(),
    region: nullableText(60),
    language: nullableText(60),
});

const PatchSchema = z
    .object({
        set: EditsSchema.optional(),
        revert: z.array(z.enum(EDITABLE_FIELDS)).max(EDITABLE_FIELDS.length).optional(),
    })
    .refine(
        (value) => value.set !== undefined || value.revert !== undefined,
        "Provide set, revert, or both.",
    );

export async function PATCH(
    request: Request,
    context: { params: Promise<{ slug: string }> },
) {
    const { slug } = await context.params;
    if (!request.headers.get("content-type")?.includes("application/json")) {
        return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json.");
    }
    const body: unknown = await request.json().catch(() => undefined);
    if (body === undefined) {
        return errorResponse(400, "BAD_REQUEST", "Request body is not valid JSON.");
    }
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
        return errorResponse(400, "BAD_REQUEST", "Invalid metadata edit.", {
            issues: z.prettifyError(parsed.error),
        });
    }
    const gameId = gameIdForSlug(db, slug);
    if (gameId === null) return errorResponse(404, "NOT_FOUND", "No game with that slug.");
    if (parsed.data.revert !== undefined && parsed.data.revert.length > 0) {
        revertFields(db, gameId, parsed.data.revert);
    }
    if (parsed.data.set !== undefined) {
        updateManualMetadata(db, gameId, parsed.data.set);
    }
    const game = getGameDetail(db, slug);
    if (!game) return errorResponse(404, "NOT_FOUND", "No game with that slug.");
    return NextResponse.json({ game });
}