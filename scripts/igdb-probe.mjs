const id = process.env.IGDB_CLIENT_ID;
const secret = process.env.IGDB_CLIENT_SECRET;
if (!id || !secret) {
  console.error("IGDB_CLIENT_ID / IGDB_CLIENT_SECRET are not set in .env.local");
  process.exit(2);
}

const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
tokenUrl.searchParams.set("client_id", id);
tokenUrl.searchParams.set("client_secret", secret);
tokenUrl.searchParams.set("grant_type", "client_credentials");

const tokenStarted = Date.now();
const tokenResponse = await fetch(tokenUrl, { method: "POST" });
console.log(`[token] HTTP ${tokenResponse.status} in ${Date.now() - tokenStarted}ms`);
if (!tokenResponse.ok) {
  console.error(await tokenResponse.text());
  process.exit(1);
}
const token = await tokenResponse.json();
console.log(`  type=${token.token_type} expires_in=${token.expires_in}s (~${Math.round(token.expires_in / 86400)} days)`);
const query = `
fields name, slug, summary, first_release_date, total_rating, total_rating_count,
       genres.name, game_modes.name, platforms.id, platforms.name,
       involved_companies.developer, involved_companies.publisher,
       involved_companies.company.name,
       cover.image_id, cover.width, cover.height;
where id = 1025;
`.trim();
const started = Date.now();
const response = await fetch("https://api.igdb.com/v4/games", {
  method: "POST",
  headers: {
    "Client-ID": id,
    Authorization: `Bearer ${token.access_token}`,
    Accept: "application/json",
  },
  body: query,
});
console.log(`[games] HTTP ${response.status} in ${Date.now() - started}ms`);
const text = await response.text();
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}