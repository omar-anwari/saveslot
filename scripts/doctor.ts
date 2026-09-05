import { access, constants, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { db, sqlite } from "../db/client.ts";
import { platforms, saveStates, saves, scanRuns } from "../db/schema.ts";
import { env } from "../lib/config/env.ts";

type Status = "ok" | "warn" | "fail";

interface Check {
    name: string;
    status: Status;
    detail: string;
}

const STALE_TEMP_MS = 60 * 60 * 1000;

async function readable(target: string): Promise<boolean> {
    try {
        await access(target, constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

async function writable(target: string): Promise<boolean> {
    try {
        await access(target, constants.W_OK);
        return true;
    } catch {
        return false;
    }
}

function nodeCheck(): Check {
    const [major] = process.versions.node.split(".");
    const ok = major === "24";
    return {
        name: "Node runtime",
        status: ok ? "ok" : "warn",
        detail: ok
            ? `v${process.versions.node}`
            : `v${process.versions.node}; package.json engines wants the 24.x line`,
    };
}

async function libraryCheck(): Promise<Check> {
    const ok = await readable(env.romLibraryPath);
    return {
        name: "ROM library",
        status: ok ? "ok" : "fail",
        detail: ok
            ? `${env.ROM_LIBRARY_PATH} is readable`
            : `${env.ROM_LIBRARY_PATH} cannot be read`,
    };
}

async function dataCheck(): Promise<Check> {
    const ok = await writable(env.appDataPath);
    return {
        name: "Application data",
        status: ok ? "ok" : "fail",
        detail: ok
            ? `${env.APP_DATA_PATH} is writable`
            : `${env.APP_DATA_PATH} is not writable`,
    };
}

async function migrationCheck(): Promise<Check> {
    let onDisk = 0;
    try {
        const entries = await readdir(path.resolve(process.cwd(), "db/migrations"));
        onDisk = entries.filter((name) => name.endsWith(".sql")).length;
    } catch {
        return {
            name: "Migrations",
            status: "fail",
            detail: "db/migrations could not be read",
        };
    }
    try {
        const row = db.get<{ count: number }>(
            sql`select count(*) as count from __drizzle_migrations`,
        );
        const applied = row?.count ?? 0;

        if (applied === onDisk) {
            return {
                name: "Migrations",
                status: "ok",
                detail: `${applied} applied`,
            };
        }
        return {
            name: "Migrations",
            status: "fail",
            detail: `${applied} applied but ${onDisk} on disk. Run pnpm db:migrate.`,
        };
    } catch {
        return {
            name: "Migrations",
            status: "fail",
            detail: "No migrations table. Run pnpm db:migrate.",
        };
    }
}

function platformCheck(): Check {
    try {
        const rows = db.select({ id: platforms.id }).from(platforms).all();
        if (rows.length === 0) {
            return {
                name: "Platform registry",
                status: "fail",
                detail: "No platforms seeded. Run pnpm db:seed.",
            };
        }
        return {
            name: "Platform registry",
            status: "ok",
            detail: `${rows.length} platforms`,
        };
    } catch {
        return {
            name: "Platform registry",
            status: "fail",
            detail: "The platforms table is unreadable",
        };
    }
}

async function emulatorCheck(): Promise<Check> {
    const versionFile = path.resolve(
        process.cwd(),
        "public/emulatorjs/installed-version.json",
    );
    if (!env.emulatorJsPinned) {
        return {
            name: "EmulatorJS",
            status: "fail",
            detail: "EMULATORJS_VERSION is not pinned",
        };
    }
    try {
        const { readFile } = await import("node:fs/promises");
        const record = JSON.parse(await readFile(versionFile, "utf8")) as {
            version: string;
        };
        if (record.version !== env.EMULATORJS_VERSION) {
            return {
                name: "EmulatorJS",
                status: "fail",
                detail: `${record.version} installed but ${env.EMULATORJS_VERSION} pinned. Run pnpm emulatorjs:sync.`,
            };
        }
        return { name: "EmulatorJS", status: "ok", detail: record.version };
    } catch {
        return {
            name: "EmulatorJS",
            status: "fail",
            detail: "Not installed. Run pnpm emulatorjs:sync.",
        };
    }
}

async function tempCheck(): Promise<Check> {
    const tempDir = path.join(env.appDataPath, "temp");
    let stale = 0;
    try {
        const entries = await readdir(tempDir);
        const cutoff = Date.now() - STALE_TEMP_MS;

        for (const name of entries) {
            const stats = await stat(path.join(tempDir, name)).catch(() => null);
            if (stats && stats.mtimeMs < cutoff) stale += 1;
        }
    } catch {
        return { name: "Temporary files", status: "ok", detail: "none" };
    }
    return stale === 0
        ? { name: "Temporary files", status: "ok", detail: "none stale" }
        : {
            name: "Temporary files",
            status: "warn",
            detail: `${stale} file(s) older than an hour in ${env.APP_DATA_PATH}/temp`,
        };
}

function scanCheck(): Check {
    const running = db
        .select({ id: scanRuns.id })
        .from(scanRuns)
        .where(sql`${scanRuns.status} = 'running'`)
        .all();
    return running.length === 0
        ? { name: "Scans", status: "ok", detail: "none running" }
        : {
            name: "Scans",
            status: "warn",
            detail: `${running.length} marked running. A restart will mark them failed.`,
        };
}

async function orphanCheck(): Promise<Check> {
    const rows = [
        ...db
            .select({ path: saves.localRelativePath })
            .from(saves)
            .all(),
        ...db
            .select({ path: saveStates.localRelativePath })
            .from(saveStates)
            .all(),
    ];
    let missing = 0;
    for (const row of rows) {
        const exists = await stat(path.resolve(env.appDataPath, row.path))
            .then(() => true)
            .catch(() => false);
        if (!exists) missing += 1;
    }
    return missing === 0
        ? {
            name: "Save and state files",
            status: "ok",
            detail: `${rows.length} tracked, all present`,
        }
        : {
            name: "Save and state files",
            status: "fail",
            detail: `${missing} of ${rows.length} records point at missing files`,
        };
}

const SYMBOL: Record<Status, string> = { ok: "ok  ", warn: "warn", fail: "FAIL" };

async function main(): Promise<number> {
    const { values } = parseArgs({
        options: { json: { type: "boolean", default: false } },
    });
    const checks: Check[] = [
        nodeCheck(),
        await libraryCheck(),
        await dataCheck(),
        await migrationCheck(),
        platformCheck(),
        await emulatorCheck(),
        scanCheck(),
        await tempCheck(),
        await orphanCheck(),
    ];
    if (values.json) {
        console.log(JSON.stringify({ checks }, null, 2));
    } else {
        const width = Math.max(...checks.map((check) => check.name.length));
        for (const check of checks) {
            console.log(
                `${SYMBOL[check.status]}  ${check.name.padEnd(width)}  ${check.detail}`,
            );
        }
    }
    const failed = checks.filter((check) => check.status === "fail").length;
    if (failed > 0) {
        console.error(`\n${failed} check(s) failed.`);
        return 1;
    }
    return 0;
}

const code = await main();
sqlite.close();
process.exit(code);