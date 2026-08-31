import type { ScanEvent, ScanRun } from "../../db/schema.ts";

export function serializeScanRun(run: ScanRun) {
    return {
        id: run.id,
        mode: run.mode,
        status: run.status,
        platform: run.platformSlug,
        counters: {
            discovered: run.discoveredCount,
            added: run.addedCount,
            updated: run.updatedCount,
            missing: run.missingCount,
            matched: run.matchedCount,
            unmatched: run.unmatchedCount,
            errors: run.errorCount,
        },
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        errorSummary: run.errorSummary,
        isRunning: run.status === "running",
    };
}

export function serializeScanEvent(event: ScanEvent) {
    return {
        id: event.id,
        level: event.level,
        type: event.eventType,
        message: event.message,
        context: event.contextJson,
        createdAt: event.createdAt,
    };
}