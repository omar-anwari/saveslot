import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "saveslot_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const VERSION = "v1";

interface SessionPayload {
    iat: number;
    exp: number;
}

function encode(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}

function sign(secret: string, data: string): string {
    return createHmac("sha256", secret).update(data).digest("base64url");
}

function equalConstantTime(left: string, right: string): boolean {
    const a = createHash("sha256").update(left, "utf8").digest();
    const b = createHash("sha256").update(right, "utf8").digest();
    return timingSafeEqual(a, b);
}

export function createSessionToken(
    secret: string,
    options: { now?: number; ttlMs?: number } = {},
): string {
    const now = options.now ?? Date.now();
    const payload: SessionPayload = { iat: now, exp: now + (options.ttlMs ?? SESSION_TTL_MS) };
    const body = `${VERSION}.${encode(JSON.stringify(payload))}`;
    return `${body}.${sign(secret, body)}`;
}

export interface VerifiedSession {
    issuedAt: number;
    expiresAt: number;
}

export function verifySessionToken(
    secret: string,
    token: string | undefined | null,
    now: number = Date.now(),
): VerifiedSession | null {
    if (typeof token !== "string" || token.length === 0) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [version, encoded, signature] = parts as [string, string, string];
    if (version !== VERSION) return null;
    if (!equalConstantTime(sign(secret, `${version}.${encoded}`), signature)) return null;
    let payload: unknown;
    try {
        payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
        return null;
    }
    if (typeof payload !== "object" || payload === null) return null;
    const { iat, exp } = payload as Record<string, unknown>;
    if (typeof iat !== "number" || typeof exp !== "number") return null;
    if (!Number.isFinite(iat) || !Number.isFinite(exp)) return null;
    if (exp <= now) return null;
    return { issuedAt: iat, expiresAt: exp };
}

export function verifyPassword(expected: string, provided: unknown): boolean {
    if (typeof provided !== "string") return false;
    if (expected.length === 0) return false;
    return equalConstantTime(expected, provided);
}