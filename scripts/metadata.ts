import { parseArgs } from "node:util";
import { db, sqlite } from "../db/client.ts";
import { games } from "../db/schema.ts";
import { env } from "../lib/config/env.ts";
import { runEnrichmentPass, runMetadataPass } from "../lib/metadata/metadata-service.ts";
import { configuredProviders } from "../lib/metadata/providers/index.ts";

const USAGE = `
Usage: pnpm metadata [options]

Two phases. Identify: match ROM checksums against a signature database.
Describe: enrich each identified game from a richer provider.

Options:
  --platform <slug>    Restrict to one platform, e.g. nes
  --limit <n>          Stop after n games per phase
  --all                Include games that already matched (identify phase)
  --force              Ignore cached answers and ask the providers again
  --identify-only      Skip the describe phase
  --describe-only      Skip the identify phase
  --health             Check the providers and exit
  -h, --help           Show this message

Examples:
  pnpm metadata
  pnpm metadata --describe-only
  pnpm metadata --platform nes --limit 5
`.trim();

function seconds(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
}

function titleMap(): Map<number, string> {
    return new Map(
        db.select({ id: games.id, title: games.title }).from(games).all()
            .map((row) => [row.id, row.title]),
    );
}

async function main(): Promise<number> {
    const { values } = parseArgs({
        options: {
            platform: { type: "string" },
            limit: { type: "string" },
            all: { type: "boolean", default: false },
            force: { type: "boolean", default: false },
            "identify-only": { type: "boolean", default: false },
            "describe-only": { type: "boolean", default: false },
            health: { type: "boolean", default: false },
            help: { type: "boolean", short: "h", default: false },
        },
    });
    if (values.help) {
        console.log(USAGE);
        return 0;
    }
    const { identifier, enricher } = await configuredProviders();
    if (values.health) {
        let ok = true;
        for (const provider of [identifier, enricher]) {
            if (provider === null) continue;
            const health = await provider.healthCheck();
            ok &&= health.ok;
            console.log(
                `${provider.key.padEnd(9)} ${health.ok ? "ok    " : "FAILED"} ` +
                `${health.latencyMs === null ? "" : seconds(health.latencyMs).padStart(6)}  ${health.message}`,
            );
        }
        if (identifier === null) console.log("hasheous  disabled (HASHEOUS_ENABLED)");
        if (enricher === null) console.log("igdb      not configured (IGDB_CLIENT_ID / IGDB_CLIENT_SECRET)");
        return ok ? 0 : 1;
    }
    let limit: number | undefined;
    if (values.limit !== undefined) {
        limit = Number.parseInt(values.limit, 10);
        if (!Number.isInteger(limit) || limit <= 0) {
            console.error(`--limit must be a positive integer, got "${values.limit}".`);
            return 2;
        }
    }
    const shared = {
        platformSlug: values.platform,
        limit,
        forceRefresh: values.force,
        delayMs: env.METADATA_REQUEST_DELAY_MS,
    };
    let failed = false;
    if (!values["describe-only"]) {
        if (identifier === null) {
            console.error("No identifying provider. Set HASHEOUS_ENABLED=true in .env.local.");
            return 2;
        }
        const titles = titleMap();
        console.log(`Identify — ${identifier.key} (timeout ${seconds(env.METADATA_REQUEST_TIMEOUT_MS)})\n`);
        let lastAt = Date.now();
        const summary = await runMetadataPass(db, {
            ...shared,
            provider: identifier,
            includeMatched: values.all,
            onProgress: (result, index, total) => {
                const elapsed = Date.now() - lastAt;
                lastAt = Date.now();
                const detail = result.appliedTitle !== null ? ` -> ${result.appliedTitle}`
                    : result.message !== null ? ` (${result.message})` : "";
                console.log(
                    `  [${index + 1}/${total}] ${titles.get(result.gameId) ?? result.gameId}: ` +
                    `${result.outcome}${detail}${result.fromCache ? " [cached]" : ""} ${seconds(elapsed)}`,
                );
            },
        });
        console.log(
            `\n  matched ${summary.matched} · partial ${summary.partial} · not found ${summary.notFound}` +
            ` · skipped ${summary.skipped} · errors ${summary.errors} · cached ${summary.fromCache}\n`,
        );
        if (summary.abortedReason !== null) {
            console.warn(`${summary.abortedReason}\n`);
            failed = true;
        }
    }
    if (!values["identify-only"] && !failed) {
        if (enricher === null) {
            console.log("Describe — skipped, IGDB is not configured.");
        } else {
            const titles = titleMap();
            console.log(`Describe — ${enricher.key}\n`);
            let lastAt = Date.now();
            const summary = await runEnrichmentPass(db, {
                ...shared,
                provider: enricher,
                onProgress: (result, index, total) => {
                    const elapsed = Date.now() - lastAt;
                    lastAt = Date.now();
                    const detail = result.appliedTitle !== null ? ` -> ${result.appliedTitle}`
                        : result.message !== null ? ` (${result.message})` : "";
                    console.log(
                        `  [${index + 1}/${total}] ${titles.get(result.gameId) ?? result.gameId}: ` +
                        `${result.outcome}${detail} ${seconds(elapsed)}`,
                    );
                },
            });
            console.log(
                `\n  enriched ${summary.enriched} · reused ${summary.reused} · not found ${summary.notFound}` +
                ` · skipped ${summary.skipped} · errors ${summary.errors}`,
            );
            if (summary.abortedReason !== null) {
                console.warn(`\n${summary.abortedReason}`);
                failed = true;
            }
        }
    }
    return failed ? 1 : 0;
}
const exitCode = await main();
sqlite.close();
process.exit(exitCode);