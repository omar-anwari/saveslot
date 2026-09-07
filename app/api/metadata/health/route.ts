import { NextResponse } from "next/server";
import { configuredProviders } from "@/lib/metadata/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEALTH_TIMEOUT_MS = 30_000;

export async function GET() {
    const { identifier, enricher } = await configuredProviders();
    const roles = [
        { role: "identifier" as const, provider: identifier },
        { role: "enricher" as const, provider: enricher },
    ];
    const providers = await Promise.all(
        roles.map(async ({ role, provider }) => {
            if (provider === null) {
                return {
                    role,
                    key: null,
                    configured: false,
                    ok: false,
                    latencyMs: null,
                    message:
                        role === "identifier"
                            ? "Set HASHEOUS_ENABLED=true in .env.local."
                            : "Set IGDB_CLIENT_ID and IGDB_CLIENT_SECRET in .env.local.",
                };
            }
            const health = await provider.healthCheck(AbortSignal.timeout(HEALTH_TIMEOUT_MS));
            return { role, key: provider.key, configured: true, ...health };
        }),
    );
    return NextResponse.json(
        { providers, checkedAt: new Date().toISOString() },
        { headers: { "cache-control": "no-store" } },
    );
}