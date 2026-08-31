import { parseArgs } from "node:util";
import { db, sqlite } from "../db/client.ts";
import { SCAN_MODES } from "../db/schema.ts";
import { env } from "../lib/config/env.ts";
import { failAbandonedScanRuns } from "../lib/scanning/scan-run.ts";
import { ScanInProgressError } from "../lib/scanning/scan-lock.ts";
import { runScan } from "../lib/scanning/scan-service.ts";

const USAGE = `
Usage: pnpm scan [options]

Options:
  --mode <mode>        ${SCAN_MODES.join(" | ")}   (default: quick)
  --platform <slug>    Restrict the scan to one platform, e.g. gba
  -h, --help           Show this message

Examples:
  pnpm scan --mode quick
  pnpm scan --mode full --platform gba
  pnpm scan --mode hashes-only
`.trim();

function isScanMode(value: string): value is (typeof SCAN_MODES)[number] {
    return (SCAN_MODES as readonly string[]).includes(value);
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

async function main(): Promise<number> {
    const { values } = parseArgs({
        options: {
            mode: { type: "string", default: "quick" },
            platform: { type: "string" },
            help: { type: "boolean", short: "h", default: false },
        },
    });
    if (values.help) {
        console.log(USAGE);
        return 0;
    }
    const mode = values.mode ?? "quick";
    if (!isScanMode(mode)) {
        console.error(`Unknown mode "${mode}".\n`);
        console.error(USAGE);
        return 2;
    }
    const reaped = failAbandonedScanRuns(db);
    if (reaped > 0) {
        console.warn(
            `Marked ${reaped} interrupted scan${reaped === 1 ? "" : "s"} as failed.`,
        );
    }
    console.log(`Scanning ${env.ROM_LIBRARY_PATH} (mode: ${mode})`);
    if (values.platform) console.log(`Platform filter: ${values.platform}`);
    const startedAt = Date.now();
    try {
        const { scanRunId, counters } = await runScan(db, {
            libraryRoot: env.romLibraryPath,
            mode,
            platformSlug: values.platform,
            hashConcurrency: env.SCAN_CONCURRENCY,
            algorithms: env.scanHashAlgorithms,
        });
        console.log(
            [
                "",
                `Scan ${scanRunId} finished in ${formatDuration(Date.now() - startedAt)}`,
                `  discovered ${counters.discovered}`,
                `  added      ${counters.added}`,
                `  updated    ${counters.updated}`,
                `  missing    ${counters.missing}`,
                `  unmatched  ${counters.unmatched}`,
                `  errors     ${counters.errors}`,
            ].join("\n"),
        );
        if (counters.errors > 0) {
            console.warn(
                "\nSome files could not be processed. See the scan events for details.",
            );
        }
        return 0;
    } catch (error) {
        if (error instanceof ScanInProgressError) {
            console.error(
                `A scan is already running (${error.activeScanRunId}). ` +
                "Wait for it to finish, or cancel it first.",
            );
            return 3;
        }
        console.error(
            error instanceof Error ? error.message : "Scan failed for an unknown reason.",
        );
        return 1;
    }
}

const exitCode = await main();
sqlite.close();
process.exit(exitCode);