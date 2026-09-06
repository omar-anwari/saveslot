import { writeFile } from "node:fs/promises";

const id = process.env.IGDB_CLIENT_ID;
const secret = process.env.IGDB_CLIENT_SECRET;
const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
tokenUrl.searchParams.set("client_id", id);
tokenUrl.searchParams.set("client_secret", secret);
tokenUrl.searchParams.set("grant_type", "client_credentials");
const token = await (await fetch(tokenUrl, { method: "POST" })).json();

const FIELDS =
  "name, slug, summary, first_release_date, total_rating, total_rating_count, genres.name, game_modes.id, game_modes.name, platforms.id, platforms.name, involved_companies.developer, involved_companies.publisher, involved_companies.company.name, cover.image_id";

const response = await fetch("https://api.igdb.com/v4/games", {
  method: "POST",
  headers: {
    "Client-ID": id,
    Authorization: `Bearer ${token.access_token}`,
    Accept: "application/json",
  },
  body: `fields ${FIELDS}; where id = (1025, 1030); limit 5;`,
});
const games = await response.json();
await writeFile(
  "tests/fixtures/igdb/games.json",
  JSON.stringify(games, null, 2),
);
console.log(
  `HTTP ${response.status} — saved ${games.length} game(s):`,
  games.map((g) => `${g.id} ${g.name}`),
);
