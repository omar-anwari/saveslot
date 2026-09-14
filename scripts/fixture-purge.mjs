import Database from "better-sqlite3";

const remove = process.argv.includes("--delete");
const db = new Database("./dev-data/app.sqlite", { readonly: !remove });
if (remove) db.pragma("foreign_keys = ON");

const WHERE = `
  select g.id from games g
  join game_files f on f.game_id = g.id
  group by g.id
  having sum(case when f.is_fixture = 0 then 1 else 0 end) = 0
`;

const rows = db
  .prepare(
    `
  select g.id, g.title,
         (select count(*) from saves s where s.game_id = g.id) saves,
         (select count(*) from save_states t where t.game_id = g.id) states
  from games g
  where g.id in (${WHERE})
  order by g.title
`,
  )
  .all();

console.log(`${rows.length} games are made only of fixture files`);
let risky = 0;
for (const row of rows) {
  const extra = [];
  if (row.saves > 0) {
    extra.push(`${row.saves} saves`);
    risky += 1;
  }
  if (row.states > 0) {
    extra.push(`${row.states} states`);
    risky += 1;
  }
  console.log(
    "  ",
    row.title,
    extra.length > 0 ? `<- ${extra.join(", ")}` : "",
  );
}

if (!remove) {
  console.log(`\nNothing changed. Re-run with --delete to remove them.`);
} else if (risky > 0) {
  console.log(`\nRefusing: ${risky} of these have saves or states attached.`);
  process.exitCode = 1;
} else {
  const changed = db
    .prepare(`delete from games where id in (${WHERE})`)
    .run().changes;
  console.log(`\nRemoved ${changed} games and their files by cascade.`);
}
db.close();
