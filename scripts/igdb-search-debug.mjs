const id = process.env.IGDB_CLIENT_ID;
const secret = process.env.IGDB_CLIENT_SECRET;
const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
tokenUrl.searchParams.set("client_id", id);
tokenUrl.searchParams.set("client_secret", secret);
tokenUrl.searchParams.set("grant_type", "client_credentials");
const token = await (await fetch(tokenUrl, { method: "POST" })).json();

async function run(label, body) {
  const response = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": id,
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/json",
    },
    body,
  });
  const text = await response.text();
  console.log(`\n--- ${label}  [HTTP ${response.status}]`);
  console.log(`    ${body}`);
  if (!response.ok) {
    console.log("   ", text.slice(0, 200));
    return;
  }
  const rows = JSON.parse(text);
  if (rows.length === 0) {
    console.log("    (nothing)");
    return;
  }
  for (const row of rows.slice(0, 12)) {
    const platforms = (row.platforms ?? []).map((p) => p.id).join(",");
    console.log(
      `    ${String(row.id).padStart(7)}  ${row.name}   [${platforms}]`,
    );
  }
  await new Promise((r) => setTimeout(r, 300));
}

const FIELDS = "fields id, name, platforms.id;";
await run(
  "search + platform filter, limit 10",
  `search "Star Ocean"; ${FIELDS} where platforms = (19); limit 10;`,
);
await run(
  "search + platform filter, limit 50",
  `search "Star Ocean"; ${FIELDS} where platforms = (19); limit 50;`,
);
await run("search only, limit 10", `search "Star Ocean"; ${FIELDS} limit 10;`);
await run(
  'where name ~ *"Star Ocean"*',
  `${FIELDS} where name ~ *"Star Ocean"* & platforms = (19); limit 10;`,
);
