const id = process.env.IGDB_CLIENT_ID;
const secret = process.env.IGDB_CLIENT_SECRET;
const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
tokenUrl.searchParams.set("client_id", id);
tokenUrl.searchParams.set("client_secret", secret);
tokenUrl.searchParams.set("grant_type", "client_credentials");
const token = await (await fetch(tokenUrl, { method: "POST" })).json();

async function search(term, withPlatform) {
  const body = [
    `search "${term}";`,
    "fields name, first_release_date, platforms.id;",
    withPlatform ? "where platforms = (33);" : "",
    "limit 5;",
  ].filter(Boolean).join(" ");

  const response = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: { "Client-ID": id, Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
    body,
  });
  const rows = response.ok ? await response.json() : await response.text();
  const label = `${withPlatform ? "gb-only " : "any      "} "${term}"`;
  if (!response.ok) { console.log(`${label}\n    HTTP ${response.status}: ${rows}`); return; }
  console.log(`${label}\n    ${rows.length === 0 ? "(nothing)" : rows.map((g) => g.name).join(" | ")}`);
  await new Promise((r) => setTimeout(r, 300));
}

const terms = [
  "Legend of Zelda, The - Link's Awakening Rev 1",
  "Legend of Zelda, The - Link's Awakening",
  "The Legend of Zelda: Link's Awakening",
  "Link's Awakening",
];
for (const term of terms) { await search(term, true); }
console.log("");
for (const term of terms) { await search(term, false); }