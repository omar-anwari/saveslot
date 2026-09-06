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
  body: "fields id, name, abbreviation; where id = (4,5,18,19,22,24,29,33,35,37,41,51,64); limit 50; sort id asc;",
});
console.log(`HTTP ${response.status}`);
for (const platform of await response.json()) {
  console.log(String(platform.id).padStart(3), (platform.abbreviation ?? "-").padEnd(8), platform.name);
}