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

What is in place: path traversal and symlink escape are rejected on every file
route, uploads are size-limited while streaming, screenshots are validated by
magic bytes rather than declared type, filenames are sanitised before entering
headers, and the player runs cross-origin isolated with COOP and COEP.

## Development commands

```bash
pnpm dev                  # development server
pnpm build && pnpm start  # production build
pnpm test                 # unit and integration tests
pnpm test:watch
pnpm test:all             # lint + typecheck + test + build
pnpm lint
pnpm typecheck

pnpm db:generate          # create a migration from schema changes
pnpm db:migrate
pnpm db:seed
pnpm db:studio

pnpm run setup:local
pnpm run doctor
pnpm run scan --mode quick
pnpm run fixtures
pnpm run emulatorjs:sync
pnpm run emulatorjs:check
```

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
