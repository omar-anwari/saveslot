import { runArtworkPass } from "../artwork/service.ts";
import { env } from "../config/env.ts";
import {
    ScanInProgressError,
    acquireScanLock,
    currentScanRunId,
    releaseScanLock,
} from "../scanning/scan-lock.ts";
import {
    EMPTY_COUNTERS,
    completeScanRun,
    createScanRun,
    failScanRun,
    recordScanEvent,
    startScanRun,
    updateScanCounters,
    updateScanProgress,
    type ScanCounters,
    type ScanDatabase,
} from "../scanning/scan-run.ts";
import { runEnrichmentPass, runMetadataPass } from "./metadata-service.ts";
import { configuredProviders } from "./providers/index.ts";

export interface MetadataRunOptions {
    platformSlug?: string;
    limit?: number;
    forceRefresh?: boolean;
    includeMatched?: boolean;
}

export interface StartedMetadataRun {
    scanRunId: string;
    completion: Promise<void>;
}

export function startMetadataRun(
    db: ScanDatabase,
    options: MetadataRunOptions = {},
): StartedMetadataRun {
    const active = currentScanRunId();
    if (active !== null) throw new ScanInProgressError(active);
    const scanRunId = createScanRun(db, {
        mode: "metadata-only",
        platformSlug: options.platformSlug,
    });
    acquireScanLock(scanRunId);
    const completion = execute(db, scanRunId, options).finally(() => releaseScanLock());
    return { scanRunId, completion };
}

async function execute(
    db: ScanDatabase,
    scanRunId: string,
    options: MetadataRunOptions,
): Promise<void> {
    startScanRun(db, scanRunId);
    const counters: ScanCounters = { ...EMPTY_COUNTERS };
    const shared = {
        platformSlug: options.platformSlug,
        limit: options.limit,
        forceRefresh: options.forceRefresh,
        concurrency: env.METADATA_CONCURRENCY,
        delayMs: env.METADATA_REQUEST_DELAY_MS,
    };
    try {
        const { identifier, enricher } = await configuredProviders();
        if (identifier === null) {
            throw new Error(
                "No identifying provider is configured. Set HASHEOUS_ENABLED=true in .env.local.",
            );
        }
        const identify = await runMetadataPass(db, {
            ...shared,
            provider: identifier,
            includeMatched: options.includeMatched,
            onProgress: (_result, index, total) => {
                updateScanProgress(db, scanRunId, { phase: "identifying", done: index + 1, total });
            },
        });
        counters.discovered = identify.total;
        counters.matched = identify.matched;
        counters.unmatched = identify.notFound + identify.partial;
        counters.errors = identify.errors;
        updateScanCounters(db, scanRunId, counters);
        recordScanEvent(db, scanRunId, {
            level: identify.errors > 0 ? "warning" : "info",
            eventType: "metadata.identified",
            message:
                `Identified ${identify.matched} of ${identify.total} games ` +
                `(${identify.fromCache} from cache, ${identify.skipped} skipped).`,
            context: { ...identify },
        });
        if (identify.abortedReason !== null) {
            recordScanEvent(db, scanRunId, {
                level: "warning",
                eventType: "metadata.aborted",
                message: identify.abortedReason,
                context: { phase: "identifying" },
            });
        }
        if (enricher === null) {
            recordScanEvent(db, scanRunId, {
                level: "info",
                eventType: "metadata.describe-skipped",
                message: "IGDB is not configured, so titles and artwork were left as they are.",
                context: {},
            });
        } else {
            const describe = await runEnrichmentPass(db, {
                ...shared,
                provider: enricher,
                onProgress: (_result, index, total) => {
                    updateScanProgress(db, scanRunId, { phase: "describing", done: index + 1, total });
                },
            });
            counters.errors += describe.errors;
            updateScanCounters(db, scanRunId, counters);
            recordScanEvent(db, scanRunId, {
                level: describe.errors > 0 ? "warning" : "info",
                eventType: "metadata.described",
                message: `Described ${describe.enriched} games (${describe.reused} already had one).`,
                context: { ...describe },
            });
            const artwork = await runArtworkPass(db, {
                ...shared,
                dataRoot: env.appDataPath,
                timeoutMs: env.METADATA_REQUEST_TIMEOUT_MS,
                onProgress: (_result, index, total) => {
                    updateScanProgress(db, scanRunId, { phase: "artwork", done: index + 1, total });
                },
            });
            counters.errors += artwork.errors;
            updateScanCounters(db, scanRunId, counters);
            recordScanEvent(db, scanRunId, {
                level: artwork.errors > 0 ? "warning" : "info",
                eventType: "metadata.artwork",
                message: `Cached ${artwork.cached} covers (${artwork.reused} already present).`,
                context: { ...artwork },
            });
        }
        updateScanProgress(db, scanRunId, { phase: null, done: 0, total: 0 });
        completeScanRun(db, scanRunId, counters);
    } catch (error) {
        updateScanProgress(db, scanRunId, { phase: null, done: 0, total: 0 });
        failScanRun(
            db,
            scanRunId,
            error instanceof Error ? error.message : "The metadata pass failed.",
        );
    }
}