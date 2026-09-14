import Database from "better-sqlite3";
import { env } from "../lib/config/env.ts";
import { deriveSortTitle } from "../lib/scanning/filename.ts";

const write = process.argv.includes("--write");
const db = new Database(env.databasePath, { readonly: !write });
const rows = db.prepare("select id, title, sort_title from games").all() as {
    id: number;
    title: string;
    sort_title: string;
}[];
const stale = rows.filter((row) => deriveSortTitle(row.title) !== row.sort_title);

console.log(`${stale.length} of ${rows.length} games have a stale sort key`);
for (const row of stale.slice(0, 15)) {
    console.log(`   ${JSON.stringify(row.sort_title)}  ->  ${JSON.stringify(deriveSortTitle(row.title))}`);
}
if (stale.length > 15) console.log(`   ... and ${stale.length - 15} more`);

if (!write) {
    console.log("\nNothing changed. Re-run with --write to apply.");
} else {
    const update = db.prepare("update games set sort_title = ?, updated_at = unixepoch() where id = ?");
    db.transaction((items: typeof stale) => {
        for (const row of items) update.run(deriveSortTitle(row.title), row.id);
    })(stale);
    console.log(`\nUpdated ${stale.length} rows.`);
}
db.close();