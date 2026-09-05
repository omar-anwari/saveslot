import { parseArgs } from "node:util";
import { db, sqlite } from "../db/client.ts";
import { games } from "../db/schema.ts";
import { env } from "../lib/config/env.ts";
import { runMetadataPass } from "../lib/metadata/metadata-service.ts";
import { configuredProviders } from "../lib/metadata/providers/index.ts";

const USAGE = `
Usage: pnpm metadata [options]

Identifies games by ROM checksum against a metadata provider. Only games
that have never matched are visited unless --all is used.

Options:
  --platform <slug>    Restrict to one platform, e.g. nes
  --limit <n>          Stop after n games
  --all                Include games that already matched
  --force              Ignore cached provider answers and ask again
  --health             Check the provider and exit
  -h, --help           Show this message

Examples:
  pnpm metadata
  pnpm metadata --platform nes --limit 5
  pnpm metadata --all --force
`.trim();

function seconds(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
}

async function main(): Promise<number> {
    const { values } = parseArgs({
        options: {
            platform: { type: "string" },
            limit: { type: "string" },
            all: { type: "boolean", default: false },
            force: { type: "boolean", default: false },
            health: { type: "boolean", default: false },
            help: { type: "boolean", short: "h", default: false },
        },
    });
    if (values.help) {
        console.log(USAGE);
        return 0;
    }
    const providers = await configuredProviders();
    const provider = providers[0];
    if (provider === undefined) {
        console.error("No metadata provider is configured. Set HASHEOUS_ENABLED=true in .env.local.");
        return 2;
    }
    if (values.health) {
        const health = await provider.healthCheck();
        console.log(`${provider.key}: ${health.ok ? "ok" : "FAILED"} - ${health.message}`);
        if (health.latencyMs !== null) console.log(`  latency ${seconds(health.latencyMs)}`);
        return health.ok ? 0 : 1;
    }
    let limit: number | undefined;
    if (values.limit !== undefined) {
        limit = Number.parseInt(values.limit, 10);
        if (!Number.isInteger(limit) || limit <= 0) {
            console.error(`--limit must be a positive integer, got "${values.limit}".`);
            return 2;
        }
    }
    const titles = new Map(
        db.select({ id: games.id, title: games.title }).from(games).all().map((row) => [row.id, row.title]),
    );
    console.log(
        `Identifying with ${provider.key} ` +
        `(timeout ${seconds(env.METADATA_REQUEST_TIMEOUT_MS)}, ` +
        `delay ${env.METADATA_REQUEST_DELAY_MS}ms)`,
    );
    if (values.platform !== undefined) console.log(`Platform filter: ${values.platform}`);
    console.log("");
    const startedAt = Date.now();
    let lastAt = startedAt;
    const summary = await runMetadataPass(db, {
        provider,
        platformSlug: values.platform,
        limit,
        includeMatched: values.all,
        forceRefresh: values.force,
        delayMs: env.METADATA_REQUEST_DELAY_MS,
        onProgress: (result, index, total) => {
            const elapsed = Date.now() - lastAt;
            lastAt = Date.now();
            const name = titles.get(result.gameId) ?? `game ${result.gameId}`;
            const detail =
                result.appliedTitle !== null ? ` -> ${result.appliedTitle}`
                    : result.message !== null ? ` (${result.message})`
                        : "";
            const cached = result.fromCache ? " [cached]" : "";
            console.log(
                `  [${index + 1}/${total}] ${name}: ${result.outcome}${detail}${cached} ${seconds(elapsed)}`,
            );
        },
    });
    console.log(
        [
            "",
            `Finished in ${seconds(Date.now() - startedAt)}`,
            `  considered ${summary.total}`,
            `  matched    ${summary.matched}`,
            `  partial    ${summary.partial}`,
            `  not found  ${summary.notFound}`,
            `  skipped    ${summary.skipped}`,
            `  errors     ${summary.errors}`,
            `  from cache ${summary.fromCache}`,
        ].join("\n"),
    );
    if (summary.abortedReason !== null) {
        console.warn(`\n${summary.abortedReason}`);
        return 1;
    }
    return 0;
}

const exitCode = await main();
sqlite.close();
process.exit(exitCode);