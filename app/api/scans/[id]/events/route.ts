import { and, asc, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { SCAN_EVENT_LEVELS, scanEvents, scanRuns } from "@/db/schema";
import { errorResponse } from "../../../errors";
import { serializeScanEvent } from "@/lib/api/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function isLevel(value: string): value is (typeof SCAN_EVENT_LEVELS)[number] {
  return (SCAN_EVENT_LEVELS as readonly string[]).includes(value);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const run = db
    .select({ id: scanRuns.id })
    .from(scanRuns)
    .where(eq(scanRuns.id, id))
    .get();
  if (!run) {
    return errorResponse(404, "NOT_FOUND", "No scan with that id.");
  }
  const url = new URL(request.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const levelParam = url.searchParams.get("level");
  if (levelParam !== null && !isLevel(levelParam)) {
    return errorResponse(400, "BAD_REQUEST", "Unknown event level.", {
      supported: [...SCAN_EVENT_LEVELS],
    });
  }
  const rawAfter = Number.parseInt(url.searchParams.get("after") ?? "", 10);
  const after = Number.isFinite(rawAfter) ? rawAfter : null;
  const conditions = [eq(scanEvents.scanRunId, id)];
  if (levelParam !== null) conditions.push(eq(scanEvents.level, levelParam));
  if (after !== null) conditions.push(gt(scanEvents.id, after));
  const rows = db
    .select()
    .from(scanEvents)
    .where(and(...conditions))
    .orderBy(asc(scanEvents.id))
    .limit(limit)
    .all();
  const events = rows.map(serializeScanEvent);
  const lastEvent = events.at(-1);
  return NextResponse.json({
    events,
    nextCursor: lastEvent?.id ?? after,
    hasMore: rows.length === limit,
  });
}