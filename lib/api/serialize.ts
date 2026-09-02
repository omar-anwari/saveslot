import type { ScanEvent, ScanRun, Save } from "../../db/schema.ts";

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
        startedAt: run.startedAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
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
        createdAt: event.createdAt.toISOString(),
    };
}

export function serializeSave(save: Save) {
    return {
        id: save.id,
        coreKey: save.coreKey,
        slot: save.slot,
        kind: save.kind,
        fileExtension: save.fileExtension,
        checksumSha256: save.checksumSha256,
        byteSize: save.byteSize,
        isCurrent: save.isCurrent,
        source: save.source,
        hasScreenshot: save.screenshotRelativePath !== null,
        createdAt: save.createdAt.toISOString(),
        updatedAt: save.updatedAt.toISOString(),
    };
}