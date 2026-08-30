import { NextResponse } from "next/server";

export const ERROR_CODES = [
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "NOT_FOUND",
    "CONFLICT",
    "PAYLOAD_TOO_LARGE",
    "UNSUPPORTED_MEDIA_TYPE",
    "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
    error: {
        code: ErrorCode;
        message: string;
        requestId: string;
        details: Record<string, unknown>;
    };
}

export function errorResponse(
    status: number,
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
): NextResponse<ApiErrorBody> {
    const requestId = crypto.randomUUID();

    return NextResponse.json<ApiErrorBody>(
        { error: { code, message, requestId, details } },
        { status },
    );
}