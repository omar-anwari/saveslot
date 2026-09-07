# SaveSlot

A personal, self-hosted retro game library. Scan a folder of ROMs you own,
browse them, and play the supported ones in a browser with saves and save
states kept on the server.

Single user by design. No accounts, no sharing, no cloud.

## Screenshot

None yet. To add one: run `pnpm dev`, open http://localhost:3000, and save a
capture of the library view to `docs/screenshot.png`, then reference it here.

## What it does

- Scans a read-only ROM directory and builds a catalogue
- Derives titles, regions, revisions and languages from filenames, so it is
  useful with no metadata provider configured
- Hashes files with CRC32, MD5 and SHA-1 in a single streaming pass
- Marks files that disappear as missing without deleting their catalogue entry
- Plays supported games through a pinned, self-hosted EmulatorJS build
- Stores battery saves and save states on the server, with history, conflict
  handling and screenshots
- Restores a save in a different browser
- Tracks play sessions and credits only heartbeat-backed playtime

## Supported systems

| System                        | Folder names            | Extensions          | Core             |
| ----------------------------- | ----------------------- | ------------------- | ---------------- |
| Nintendo Entertainment System | nes, famicom, fc        | .nes .zip           | fceumm           |
| Super Nintendo                | snes, sfc, superfamicom | .sfc .smc .zip      | snes9x           |
| Game Boy                      | gb, gameboy             | .gb .zip            | gambatte         |
| Game Boy Color                | gbc, gameboycolor       | .gbc .zip           | gambatte         |
| Game Boy Advance              | gba, gameboyadvance     | .gba .zip           | mgba             |
| Sega Master System            | mastersystem, sms       | .sms .zip           | smsplus          |
| Sega Genesis / Mega Drive     | genesis, megadrive, md  | .md .gen .bin .zip  | genesis_plus_gx  |
| Sega Game Gear                | gamegear, gg            | .gg .zip            | genesis_plus_gx  |
| Nintendo 64                   | n64, nintendo64         | .z64 .n64 .v64 .zip | mupen64plus_next |

Nintendo 64 is marked experimental and has not been tested in a browser.
PlayStation, multi-disc games and BIOS handling are out of scope for now.

## Legal

This software indexes and serves files you provide. It does not download,
bundle or distribute ROMs, BIOS files or artwork, and it makes no claim that
any file you add is legal for you to possess or use. That is your
responsibility.

Use game files you own or that are freely distributable, such as homebrew and
public domain releases.

## Local setup, without Docker

Requires Node.js 24 (the active LTS line) and pnpm. Node 24 still bundles
Corepack; Node 25 and later do not.

```bash
git clone <repository-url>
cd saveslot

corepack enable
pnpm install

cp .env.example .env.local
pnpm run setup:local
pnpm dev
```

`setup:local` creates the library and data directories, applies database
migrations, and seeds the platform registry. It is safe to run repeatedly.

To play anything you also need the emulator, which is a large one-time
download:

```bash
pnpm run emulatorjs:sync    # ~300 MB
```

Then open http://localhost:3000.

Check the install at any time:

```bash
pnpm run doctor
```

## Adding a game

Put files you own into the platform folder that matches your system:

```
dev-library/
  snes/Chrono Trigger (USA).sfc
  gb/Tetris (World).gb
```

Folder names are matched case-insensitively against the aliases in the table
above. Subfolders inside a platform folder are fine — they are for your
organisation and are not treated as separate systems.

`bios/` at the library root is reserved and never scanned for games.

For scanner testing without any real ROMs:

```bash
pnpm run fixtures        # writes non-playable placeholder files
pnpm run fixtures --clean
```

Fixtures carry a `SAVESLOT-FIXTURE-V1` header. The scanner skips them unless
`ALLOW_FAKE_ROM_FIXTURES=true`, and when indexed their Play button is
disabled. `--clean` removes only files carrying that header, so it will not
touch a real ROM.

## Running a scan

From the command line:

```bash
pnpm run scan --mode quick               # new and changed files
pnpm run scan --mode full                # also re-hash everything
pnpm run scan --mode full --platform gba
pnpm run scan --mode hashes-only         # fill in missing checksums
```

Or from **Settings** in the app, which shows live progress and the scan log.

A scan never deletes anything. Files that have disappeared are marked missing
and keep their catalogue entry, metadata and saves.

## Metadata providers

**Not implemented.** The database and configuration have room for Hasheous,
IGDB and ScreenScraper, but no provider adapter has been written yet.

Until then titles come from filenames and covers are generated placeholders
coloured by platform. Everything else works normally.

## Saves and states

Battery saves upload automatically every 15 seconds while you play, and on
Save & Quit. Identical bytes are skipped, so an idle game does not fill your
history.

- **History** — the last 10 saves per game and core are kept, older ones pruned
- **Conflicts** — if another tab saved more recently, your upload is stored as
  a separate copy rather than overwriting it, and the player says so
- **Restore** — the current save is written into the emulator when a game
  launches, then read back and checksummed. If it did not take, syncing is
  paused so the server copy cannot be overwritten by an empty one
- **Save states** — captured on demand with a screenshot, filtered to the core
  that made them. Autosaves are pruned more aggressively than manual ones

Saves live in `dev-data/saves/`, states in `dev-data/states/`, both keyed by
database id rather than by title.

## Production build

```bash
pnpm build
pnpm start
```

Uses the same `.env.local` and the same data directory. Run `pnpm test:all`
first — it chains lint, typecheck, tests and build.

## Docker

**Not implemented.** No Dockerfile or Compose file exists yet.

The application is designed for it: the ROM directory is only ever read, all
writes go to `APP_DATA_PATH`, and every path is configurable by environment
variable. `better-sqlite3` is a native module, so the image will need a build
stage.

## Backup and restore

**Not implemented as a command.** `pnpm db:backup` does not exist yet.

To back up by hand, do **not** just copy `app.sqlite`. The database runs in
WAL mode, so recent commits live in `app.sqlite-wal` until a checkpoint folds
them in — and a checkpoint may not have happened for days. Copying the main
file alone silently produces a backup that is missing your latest work, with
no error to tell you.

Use SQLite's own backup, which reads through the WAL:

````bash
sqlite3 dev-data/app.sqlite ".backup 'backup/app.sqlite'"

Or, with the server stopped, copy all three files together —
app.sqlite, app.sqlite-wal and app.sqlite-shm.

Then copy:

- backup/app.sqlite — the catalogue
- `dev-data/saves/` and `dev-data/states/` — your progress
- `.env.local` — configuration, but note it may contain credentials

`dev-data/artwork/` can be regenerated and does not need backing up.

## Updating EmulatorJS

The version is pinned in `.env.local` as `EMULATORJS_VERSION` and installed
into `public/emulatorjs/`, which is not committed.

```bash
pnpm run emulatorjs:check    # is the pinned version installed?
pnpm run emulatorjs:sync     # install it
````

The sync script refuses floating versions like `latest`, and verifies the
download against the checksum GitHub publishes for the release.

Before changing the pin, know that this project calls several EmulatorJS
internals that are not in its public documentation. `lib/emulatorjs/contract.ts`
lists them and a test asserts they still exist. **Run `pnpm test` after any
upgrade** — if that contract test fails, the save and state code needs
attention before the new version is usable.

## Troubleshooting

**`Unsupported engine`** — you are on the wrong Node. Run `fnm use`.

**`pnpm doctor` shows pnpm's own output** — pnpm has a built-in command by that
name. Use `pnpm run doctor`.

**`tsc` reports errors that contradict tsconfig.json** — delete
`tsconfig.tsbuildinfo`. The incremental cache does not always invalidate on a
config change.

**Migrations out of step** — `pnpm run doctor` compares applied migrations
against the files on disk. Run `pnpm db:migrate`. Never delete rows from
`__drizzle_migrations` to test this; it makes drizzle-kit re-run DDL against a
schema that already has the objects.

**The player is a black screen** — check the browser console. Common causes are
a state file that is not a real state for that core, and a ROM that changed on
disk since the last scan, which the content route rejects with a 409. Run a
scan.

**A save will not restore** — the status line names the step that failed. The
core needs to have finished loading the ROM before it can report where its save
file lives, which is why the player waits for that rather than assuming.

## Security and exposure

There is no authentication yet. `APP_PASSWORD` is validated by the config but
nothing reads it.

**Do not expose this to the internet as it stands.** On a trusted LAN it is
fine. If you need remote access, put it behind Tailscale or an identity-aware
proxy. "Only I know the URL" is not authentication.

Replace with:

## Security and exposure

Authentication is **off by default** and enabled by setting a password:

```bash
APP_PASSWORD=choose-something-long
SESSION_SECRET=<48+ random characters>
```
Generate the secret with:
```
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```
With APP_PASSWORD set, every page and API route requires a signed session
cookie; without it, everything is open, which is
trusted LAN. The session is a signed expiry rather than a database row —
rotating SESSION_SECRET invalidates every sessio

SESSION_SECRET must be at least 32 characters wh
the app refuses to start otherwise.

This is one password and one user. It is not hardened against a determined
attacker on the open internet: there is no lockod a
short delay on a wrong password, and no second factor. For remote access, put
it behind Tailscale or an identity-aware proxy r
alone.

**7. The parts worth knowing**

- **The CSRF check runs even with auth disabled.** Without a session there's no cookie to ride — but a page on another site
could still make your browser POST a scan or a s:3000`. That's worth blocking regardless.
- **A request with neither `Sec-Fetch-Site` nor `Origin` is allowed.** Every curl command in this session sends neither;
every browser sends at least one. Rejecting headak the CLI and scripts without stopping anyattack.
- **A malformed `Origin` is rejected, not ignoret a sandboxed iframe sends — treating "I couldn'tparse it" as "it's fine" is the wrong default.
- **`appUrl` is accepted alongside the request oeverse proxy `request.nextUrl.origin` is theinternal address while the browser sends the public one.
- **The README no longer lies.** It said "there  now it says what exists and, just as importantly, what it isn't.

**8. Verify**

```bash
pnpm test lib/auth
pnpm typecheck
pnpm lint
```
Then, with the dev server running and signed in:
```
curl -s -o /dev/null -w '%{http_code} cross-sitecalhost:3000/api/auth/login \
  -H 'content-type: application/json' -H 'sec-fetch-site: cross-site' -d '{"password":"x"}'
curl -s -o /dev/null -w '%{http_code} bad-originst:3000/api/auth/login \
  -H 'content-type: application/json' -H 'origin: https://evil.example' -d '{"password":"x"}'
curl -s -o /dev/null -w '%{http_code} plain-curlst:3000/api/auth/login \
  -H 'content-type: application/json' -d '{"password":"x"}'
```
Expect 403, 403, 401 — the third proving a scripted client still works and gets a genuine auth answer rather than a CSRF rejection. Then use the app normally in the brown the player and editing metadata should all still work, since those are same-origin.

## Licences

This project's own code is unlicensed as yet; add one before publishing.

EmulatorJS is downloaded at setup time and is not part of this repository. It
carries its own licence, included in the distribution under
`public/emulatorjs/`. The emulator cores it ships are separate libretro
projects with their own licences — each core's licence is recorded in
`public/emulatorjs/data/cores/cores.json`.

Runtime dependencies and their licences can be listed with:

```bash
pnpm licenses list --prod
```
