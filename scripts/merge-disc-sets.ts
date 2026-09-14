import Database from "better-sqlite3";
import { env } from "../lib/config/env.ts";
import { detectDiscGroups } from "../lib/scanning/disc-groups.ts";

const write = process.argv.includes("--write");
const db = new Database(env.databasePath);
db.pragma("foreign_keys = ON");

const files = db
    .prepare("select relative_path as relativePath, file_name as fileName, game_id as gameId from game_files")
    .all() as { relativePath: string; fileName: string; gameId: number }[];
const groups = detectDiscGroups(files);
const affected = new Set<number>();
for (const file of files) {
    if (groups.has(file.relativePath)) affected.add(file.gameId);
}
const rows = [...affected].map((id) => ({
    id,
    ...(db.prepare(`select slug, title,
        (select count(*) from saves s where s.game_id = games.id) saves,
        (select count(*) from save_states t where t.game_id = games.id) states
        from games where id = ?`).get(id) as { slug: string; title: string; saves: number; states: number }),
}));
const risky = rows.filter((row) => row.saves > 0 || row.states > 0);
console.log(`${rows.length} game rows hold files that belong to a disc set:`);
for (const row of rows) {
    console.log(`   ${row.slug}${row.saves || row.states ? `  <- ${row.saves} saves, ${row.states} states` : ""}`);
}

if (!write) {
    console.log("\nNothing changed. Re-run with --write to delete these rows, then scan again.");
} else if (risky.length > 0) {
    console.log(`\nRefusing: ${risky.length} of them have saves or states attached.`);
    process.exitCode = 1;
} else {
    const remove = db.prepare("delete from games where id = ?");
    db.transaction((ids: number[]) => { for (const id of ids) remove.run(id); })(rows.map((row) => row.id));
    console.log(`\nRemoved ${rows.length} rows. Run a scan to re-index them as one game.`);
}
db.close();