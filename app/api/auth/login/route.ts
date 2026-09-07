import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "../../errors";
import {
    SESSION_COOKIE_NAME,
    SESSION_TTL_MS,
    createSessionToken,
    verifyPassword,
} from "@/lib/auth/session";
import { env } from "@/lib/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({ password: z.string().min(1).max(1024) });

const FAILURE_DELAY_MS = 300;

export async function POST(request: Request) {
    if (!env.appPasswordEnabled) {
        return errorResponse(400, "AUTH_DISABLED", "No APP_PASSWORD is configured.");
    }
    if (!request.headers.get("content-type")?.includes("application/json")) {
        return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json.");
    }
    const body: unknown = await request.json().catch(() => undefined);
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
        return errorResponse(400, "BAD_REQUEST", "A password is required.");
    }
    if (!verifyPassword(env.APP_PASSWORD, parsed.data.password)) {
        await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
        return errorResponse(401, "UNAUTHORIZED", "That password is not correct.");
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: createSessionToken(env.SESSION_SECRET),
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(env.APP_URL).protocol === "https:",
        path: "/",
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return response;
}