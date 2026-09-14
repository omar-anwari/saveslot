import { parseArgs } from "node:util";
import { db, sqlite } from "../db/client.ts";
import { env } from "../lib/config/env.ts";
import { listRemovable, removeGame } from "../lib/games/removal.ts";

const USAGE = `
Usage: pnpm prune [options]

Lists games with no file on disk - leftovers from ROMs you moved or deleted -
and can remove their catalogue entries. ROM files are never touched.

Options:
  --write    Actually remove them
  --force    Include games that still have saves or states
  -h, --help
`.trim();

async function main(): Promise<number> {
    const { values } = parseArgs({
        options: {
            write: { type: "boolean", default: false },
            force: { type: "boolean", default: false },
            help: { type: "boolean", short: "h", default: false },
        },
    });
    if (values.help) {
        console.log(USAGE);
        return 0;
    }
    const removable = listRemovable(db);
    if (removable.length === 0) {
        console.log("Nothing to prune: every game has a file on disk.");
        return 0;
    }
    console.log(`${removable.length} game(s) have no file on disk:`);
    for (const game of removable) {
        const extra = [
            game.saves > 0 ? `${game.saves} saves` : null,
            game.states > 0 ? `${game.states} states` : null,
        ].filter((entry) => entry !== null);
        console.log(`   ${game.slug}${extra.length > 0 ? `  <- ${extra.join(", ")}` : ""}`);
    }
    if (!values.write) {
        console.log("\nNothing changed. Re-run with --write to remove them.");
        return 0;
    }
    let removed = 0;
    let blocked = 0;
    for (const game of removable) {
        const result = await removeGame(db, game.id, {
            dataRoot: env.appDataPath,
            force: values.force,
        });
        if (result.outcome === "removed") removed += 1;
        else {
            blocked += 1;
            console.warn(`   kept ${game.slug}: ${result.reason ?? "refused"}`);
        }
    }
    console.log(`\nRemoved ${removed}, kept ${blocked}.`);
    if (blocked > 0) console.log("Pass --force to remove the ones holding saves.");
    return 0;
}
const code = await main();
sqlite.close();
process.exit(code);