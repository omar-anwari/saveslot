import { parseArgs } from "node:util";
import path from "node:path";
import { env } from "../lib/config/env.ts";
import { BackupError, createBackup } from "../lib/backup/backup.ts";

const USAGE = `
Usage: pnpm db:backup [options]

Copies the database (WAL-safe), saves and save states into a timestamped
directory. .env.local is never included: it holds your password, session
secret and provider credentials.

Options:
  --to <dir>       Where to write the backup (default: <APP_DATA_PATH>/backups)
  --artwork        Include cached cover art (re-downloadable, so off by default)
  -h, --help       Show this message
`.trim();

function humanBytes(value: number): string {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function main(): Promise<number> {
    const { values } = parseArgs({
        options: {
            to: { type: "string" },
            artwork: { type: "boolean", default: false },
            help: { type: "boolean", short: "h", default: false },
        },
    });
    if (values.help) {
        console.log(USAGE);
        return 0;
    }
    const destination = values.to ?? path.join(env.appDataPath, "backups");
    try {
        const result = await createBackup({
            dataRoot: env.appDataPath,
            databasePath: env.databasePath,
            destination,
            includeArtwork: values.artwork,
        });
        console.log(`Backup written to ${result.directory}`);
        console.log(`  app.sqlite  ${humanBytes(result.databaseBytes)} (integrity check passed)`);
        for (const tree of result.trees) {
            console.log(`  ${tree.name.padEnd(11)} ${tree.files} files, ${humanBytes(tree.bytes)}`);
        }
        console.log("\n.env.local was not included. Copy it separately if you want it.");
        return 0;
    } catch (error) {
        if (error instanceof BackupError) {
            console.error(error.message);
            return 1;
        }
        console.error(error instanceof Error ? error.message : "Backup failed.");
        return 1;
    }
}

const exitCode = await main();
process.exit(exitCode);