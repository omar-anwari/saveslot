import Database from "better-sqlite3";
import { env } from "../lib/config/env.ts";
import { detectDiscGroups } from "../lib/scanning/disc-groups.ts";

const db = new Database(env.databasePath, { readonly: true });
const files = db
    .prepare("select relative_path as relativePath, file_name as fileName from game_files where present = 1")
    .all() as { relativePath: string; fileName: string }[];
db.close();
const groups = detectDiscGroups(files);
const sets = new Map<string, string[]>();
for (const [relativePath, entry] of groups) {
    const list = sets.get(entry.groupKey) ?? [];
    list.push(`${entry.discNumber}:${relativePath.split("/").pop()}`);
    sets.set(entry.groupKey, list);
}

console.log(`${files.length} files scanned`);
console.log(`${sets.size} disc sets covering ${groups.size} files\n`);
for (const [, list] of sets) console.log("  ", list.sort().join("   "));