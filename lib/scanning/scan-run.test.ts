import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanEvents, scanRuns } from "../../db/schema.ts";
import {
    createTestDatabase,
    type TestDatabaseHandle,
} from "../../tests/helpers/test-db.ts";
import {
    EMPTY_COUNTERS,
    completeScanRun,
    createScanRun,
    failAbandonedScanRuns,
    failScanRun,
    findRunningScan,
    pruneScanEvents,
    recordScanEvent,
    startScanRun,
} from "./scan-run.ts";

let handle: TestDatabaseHandle;
beforeEach(() => {
    handle = createTestDatabase();
});
afterEach(() => {
    handle.close();
});
function getRun(id: string) {
    return handle.db.select().from(scanRuns).where(eq(scanRuns.id, id)).get();
}
describe("scan run lifecycle", () => {
    it("creates a queued run with a UUID", () => {
        const id = createScanRun(handle.db, { mode: "quick" });
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        const run = getRun(id);
        expect(run?.status).toBe("queued");
        expect(run?.mode).toBe("quick");
        expect(run?.startedAt).toBeNull();
    });
    it("records an optional platform scope", () => {
        const id = createScanRun(handle.db, { mode: "full", platformSlug: "gba" });
        expect(getRun(id)?.platformSlug).toBe("gba");
    });
    it("marks a run started", () => {
        const id = createScanRun(handle.db, { mode: "quick" });
        startScanRun(handle.db, id);
        const run = getRun(id);
        expect(run?.status).toBe("running");
        expect(run?.startedAt).toBeInstanceOf(Date);
    });
    it("completes cleanly when no errors were counted", () => {
        const id = createScanRun(handle.db, { mode: "quick" });
        startScanRun(handle.db, id);
        completeScanRun(handle.db, id, { ...EMPTY_COUNTERS, discovered: 12, added: 12 });
        const run = getRun(id);
        expect(run?.status).toBe("completed");
        expect(run?.discoveredCount).toBe(12);
        expect(run?.addedCount).toBe(12);
        expect(run?.completedAt).toBeInstanceOf(Date);
    });
    it("distinguishes a run that logged errors", () => {
        const id = createScanRun(handle.db, { mode: "full" });
        completeScanRun(handle.db, id, { ...EMPTY_COUNTERS, errors: 3 });
        expect(getRun(id)?.status).toBe("completed_with_errors");
    });
    it("truncates a failure summary", () => {
        const id = createScanRun(handle.db, { mode: "quick" });
        failScanRun(handle.db, id, "x".repeat(900));
        const run = getRun(id);
        expect(run?.status).toBe("failed");
        expect(run?.errorSummary).toHaveLength(500);
    });
    it("reaps runs abandoned by a restart", () => {
        const first = createScanRun(handle.db, { mode: "quick" });
        const second = createScanRun(handle.db, { mode: "full" });
        startScanRun(handle.db, first);
        startScanRun(handle.db, second);
        expect(failAbandonedScanRuns(handle.db)).toBe(2);
        expect(getRun(first)?.status).toBe("failed");
        expect(getRun(second)?.errorSummary).toContain("restarted");
        expect(findRunningScan(handle.db)).toBeUndefined();
    });
});
describe("scan events", () => {
    it("stores level, type and sanitized context", () => {
        const id = createScanRun(handle.db, { mode: "quick" });
        recordScanEvent(handle.db, id, {
            level: "warning",
            eventType: "file.skipped",
            message: "Unsupported extension",
            context: { relativePath: "nes/notes.txt" },
        });
        const event = handle.db.select().from(scanEvents).get();
        expect(event?.level).toBe("warning");
        expect(event?.eventType).toBe("file.skipped");
        expect(event?.contextJson).toEqual({ relativePath: "nes/notes.txt" });
    });
    it("keeps only the newest events when pruning", () => {
        const id = createScanRun(handle.db, { mode: "quick" });
        for (let i = 0; i < 25; i += 1) {
            recordScanEvent(handle.db, id, {
                level: "info",
                eventType: "file.discovered",
                message: `file ${i}`,
            });
        }
        pruneScanEvents(handle.db, id, 10);
        const remaining = handle.db.select().from(scanEvents).all();
        expect(remaining).toHaveLength(10);
        expect(remaining.map((e) => e.message)).toContain("file 24");
        expect(remaining.map((e) => e.message)).not.toContain("file 0");
    });
    it("deletes events when their run is deleted", () => {
        const id = createScanRun(handle.db, { mode: "quick" });
        recordScanEvent(handle.db, id, {
            level: "info",
            eventType: "scan.started",
            message: "started",
        });
        handle.db.delete(scanRuns).where(eq(scanRuns.id, id)).run();
        expect(handle.db.select().from(scanEvents).all()).toHaveLength(0);
    });
});