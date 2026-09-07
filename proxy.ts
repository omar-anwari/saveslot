import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteWrite } from "./lib/auth/csrf.ts";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./lib/auth/session.ts";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/health"]);

function envelope(code: string, message: string, status: number) {
    return Response.json(
        { error: { code, message, requestId: crypto.randomUUID(), details: {} } },
        { status },
    );
}

export function proxy(request: NextRequest) {
    if (
        isCrossSiteWrite({
            method: request.method,
            secFetchSite: request.headers.get("sec-fetch-site"),
            origin: request.headers.get("origin"),
            requestOrigin: request.nextUrl.origin,
            appUrl: process.env.APP_URL,
        })
    ) {
        return envelope("FORBIDDEN", "Cross-site request rejected.", 403);
    }
    const password = process.env.APP_PASSWORD ?? "";
    if (password.length === 0) return NextResponse.next();
    const { pathname } = request.nextUrl;
    if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (verifySessionToken(process.env.SESSION_SECRET ?? "", token) !== null) {
        return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
        return envelope("UNAUTHORIZED", "Sign in required.", 401);
    }
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
}
export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};