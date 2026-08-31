import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db/client";
import { scanRuns } from "@/db/schema";
import { errorResponse } from "../../errors";
import { serializeScanRun } from "@/lib/api/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const run = db.select().from(scanRuns).where(eq(scanRuns.id, id)).get();
  if (!run) {
    return errorResponse(404, "NOT_FOUND", "No scan with that id.");
  }
  return NextResponse.json({ scan: serializeScanRun(run) });
}