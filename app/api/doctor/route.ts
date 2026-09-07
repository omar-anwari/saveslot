import { NextResponse } from "next/server";
import { runDiagnostics, worstStatus } from "@/lib/diagnostics/doctor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const checks = await runDiagnostics();
    const status = worstStatus(checks);

    return NextResponse.json(
        { status, generatedAt: new Date().toISOString(), checks },
        {
            status: status === "fail" ? 503 : 200,
            headers: { "cache-control": "no-store" },
        },
    );
}