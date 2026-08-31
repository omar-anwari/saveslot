import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { scanRuns } from "@/db/schema";
import { serializeScanRun } from "@/lib/api/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const running = db
        .select()
        .from(scanRuns)
        .where(eq(scanRuns.status, "running"))
        .orderBy(desc(scanRuns.createdAt))
        .get();
    const latest =
        running ??
        db.select().from(scanRuns).orderBy(desc(scanRuns.createdAt)).get();
    if (!latest) {
        return NextResponse.json({ scan: null });
    }
    return NextResponse.json({ scan: serializeScanRun(latest) });
}