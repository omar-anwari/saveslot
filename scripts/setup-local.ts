import { access, constants } from "node:fs/promises";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "../db/client.ts";
import { seedPlatforms } from "../db/seed.ts";
import { env } from "../lib/config/env.ts";
import { ensureDataLayout, ensureLibraryLayout } from "../lib/dev/library.ts";

let step = 0;
function announce(message: string): void {
    step += 1;
    console.log(`\n[${step}] ${message}`);
}

async function exists(target: string): Promise<boolean> {
    try {
        await access(target, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function main(): Promise<number> {
    console.log("Setting up a local SaveSlot install. Safe to run repeatedly.");
    announce("Checking the runtime");
    const [major] = process.versions.node.split(".");
    console.log(`    Node ${process.versions.node}`);
    if (major !== "24") {
        console.error(
            "    package.json engines wants the 24.x line. Run `fnm use` and retry.",
        );
        return 1;
    }
    announce("Checking configuration");
    if (!(await exists(path.resolve(process.cwd(), ".env.local")))) {
        console.warn("    No .env.local found; using defaults.");
        console.warn("    Run `cp .env.example .env.local` to customise paths.");
    } else {
        console.log("    .env.local loaded");
    }
    console.log(`    library: ${env.ROM_LIBRARY_PATH}`);
    console.log(`    data:    ${env.APP_DATA_PATH}`);
    announce("Creating directories");
    await ensureLibraryLayout(env.romLibraryPath);
    await ensureDataLayout(env.appDataPath);
    console.log("    library platform folders and data directories ready");
    announce("Applying database migrations");
    migrate(db, { migrationsFolder: "db/migrations" });
    console.log("    schema up to date");
    announce("Seeding the platform registry");
    const seeded = seedPlatforms();
    console.log(
        `    ${seeded.inserted} inserted, ${seeded.updated} updated`,
    );
    announce("Checking EmulatorJS");
    const installed = await exists(
        path.resolve(process.cwd(), "public/emulatorjs/installed-version.json"),
    );
    if (installed) {
        console.log(`    ${env.EMULATORJS_VERSION} installed`);
    } else {
        console.warn("    Not installed. Run `pnpm emulatorjs:sync` (~300 MB).");
        console.warn("    The library works without it; the player will not.");
    }
    console.log(
        [
            "",
            "Setup complete.",
            "",
            "  pnpm run doctor    check the install",
            "  pnpm fixtures      generate non-playable scanner fixtures",
            "  pnpm scan          index your library",
            "  pnpm dev           start the app on http://localhost:3000",
            "",
            `Put ROMs in ${env.ROM_LIBRARY_PATH}/<platform>/ then run a scan.`,
        ].join("\n"),
    );
    return 0;
}

const code = await main();
sqlite.close();
process.exit(code);