const id = process.env.IGDB_CLIENT_ID;
const secret = process.env.IGDB_CLIENT_SECRET;

const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
tokenUrl.searchParams.set("client_id", id);
tokenUrl.searchParams.set("client_secret", secret);
tokenUrl.searchParams.set("grant_type", "client_credentials");
const token = await (await fetch(tokenUrl, { method: "POST" })).json();

const response = await fetch("https://api.igdb.com/v4/platforms", {
  method: "POST",
  headers: {
    "Client-ID": id,
    Authorization: `Bearer ${token.access_token}`,
    Accept: "application/json",
  },
  body: "fields id, name, abbreviation; limit 500; sort id asc;",
});
const rows = await response.json();
console.log(`HTTP ${response.status} — ${rows.length} platforms`);

const want =
  /atari|virtual boy|neo geo pocket|wonderswan|turbografx|pc engine|32x|jaguar|lynx|colecovision|nintendo ds|playstation|sega cd|mega-cd|saturn|psp|playstation portable/i;
for (const p of rows) {
  if (want.test(p.name)) {
    console.log(
      String(p.id).padStart(4),
      (p.abbreviation ?? "-").padEnd(10),
      p.name,
    );
  }
}
