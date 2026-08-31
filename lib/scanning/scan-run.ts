import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema.ts";
import { scanEvents, scanRuns } from "../../db/schema.ts";

export type ScanDatabase = BetterSQLite3Database<typeof schema>;
export type ScanMode = (typeof schema.SCAN_MODES)[number];
export type ScanEventLevel = (typeof schema.SCAN_EVENT_LEVELS)[number];
export const MAX_EVENTS_PER_RUN = 2000;

export interface ScanCounters {
    discovered: number;
    added: number;
    updated: number;
    missing: number;
    matched: number;
    unmatched: number;
    errors: number;
}

export const EMPTY_COUNTERS: ScanCounters = {
    discovered: 0,
    added: 0,
    updated: 0,
    missing: 0,
    matched: 0,
    unmatched: 0,
    errors: 0,
};

export function createScanRun(
    db: ScanDatabase,
    options: { mode: ScanMode; platformSlug?: string },
): string {
    const id = crypto.randomUUID();
    db.insert(scanRuns)
        .values({
            id,
            mode: options.mode,
            status: "queued",
            platformSlug: options.platformSlug ?? null,
        })
        .run();
    return id;
}

export function startScanRun(db: ScanDatabase, scanRunId: string): void {
    db.update(scanRuns)
        .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(scanRuns.id, scanRunId))
        .run();
}

export function updateScanCounters(
    db: ScanDatabase,
    scanRunId: string,
    counters: ScanCounters,
): void {
    db.update(scanRuns)
        .set({
            discoveredCount: counters.discovered,
            addedCount: counters.added,
            updatedCount: counters.updated,
            missingCount: counters.missing,
            matchedCount: counters.matched,
            unmatchedCount: counters.unmatched,
            errorCount: counters.errors,
            updatedAt: new Date(),
        })
        .where(eq(scanRuns.id, scanRunId))
        .run();
}

export interface ScanEventInput {
    level: ScanEventLevel;
    eventType: string;
    message: string;
    context?: Record<string, unknown>;
}

export function recordScanEvent(
    db: ScanDatabase,
    scanRunId: string,
    event: ScanEventInput,
): void {
    db.insert(scanEvents)
        .values({
            scanRunId,
            level: event.level,
            eventType: event.eventType,
            message: event.message,
            contextJson: event.context ?? {},
        })
        .run();
}

export function pruneScanEvents(
    db: ScanDatabase,
    scanRunId: string,
    keep: number = MAX_EVENTS_PER_RUN,
): void {
    db.run(sql`
    delete from ${scanEvents}
    where ${scanEvents.scanRunId} = ${scanRunId}
      and ${scanEvents.id} not in (
        select ${scanEvents.id} from ${scanEvents}
        where ${scanEvents.scanRunId} = ${scanRunId}
        order by ${scanEvents.id} desc
        limit ${keep}
      )
  `);
}

export function completeScanRun(
    db: ScanDatabase,
    scanRunId: string,
    counters: ScanCounters,
): void {
    updateScanCounters(db, scanRunId, counters);
    db.update(scanRuns)
        .set({
            status: counters.errors > 0 ? "completed_with_errors" : "completed",
            completedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(scanRuns.id, scanRunId))
        .run();
    pruneScanEvents(db, scanRunId);
}

export function failScanRun(
    db: ScanDatabase,
    scanRunId: string,
    errorSummary: string,
): void {
    db.update(scanRuns)
        .set({
            status: "failed",
            errorSummary: errorSummary.slice(0, 500),
            completedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(scanRuns.id, scanRunId))
        .run();
    pruneScanEvents(db, scanRunId);
}

export function failAbandonedScanRuns(db: ScanDatabase): number {
    const abandoned = db
        .select({ id: scanRuns.id })
        .from(scanRuns)
        .where(eq(scanRuns.status, "running"))
        .all();

    for (const run of abandoned) {
        failScanRun(db, run.id, "Interrupted: the server restarted mid-scan.");
    }
    return abandoned.length;
}

export function findRunningScan(db: ScanDatabase, mode?: ScanMode) {
    return db
        .select()
        .from(scanRuns)
        .where(
            mode
                ? and(eq(scanRuns.status, "running"), eq(scanRuns.mode, mode))
                : eq(scanRuns.status, "running"),
        )
        .get();
}