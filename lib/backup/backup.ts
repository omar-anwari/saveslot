import Database from "better-sqlite3";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export class BackupError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BackupError";
    }
}

export interface BackupOptions {
    dataRoot: string;
    databasePath: string;
    destination: string;
    includeArtwork?: boolean;
    now?: Date;
}

export interface CopiedTree {
    name: string;
    files: number;
    bytes: number;
}

export interface BackupResult {
    directory: string;
    databaseBytes: number;
    trees: CopiedTree[];
    manifestPath: string;
}

async function measure(directory: string): Promise<CopiedTree> {
    let files = 0;
    let bytes = 0;
    async function walk(current: string): Promise<void> {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
                continue;
            }
            files += 1;
            bytes += (await stat(full)).size;
        }
    }
    try {
        await walk(directory);
    } catch {
    }
    return { name: path.basename(directory), files, bytes };
}

async function exists(target: string): Promise<boolean> {
    try {
        await stat(target);
        return true;
    } catch {
        return false;
    }
}

export async function createBackup(options: BackupOptions): Promise<BackupResult> {
    const now = options.now ?? new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const directory = path.join(options.destination, `saveslot-backup-${stamp}`);
    if (await exists(directory)) {
        throw new BackupError(`${directory} already exists.`);
    }
    await mkdir(directory, { recursive: true });
    const databaseCopy = path.join(directory, "app.sqlite");
    const source = new Database(options.databasePath, { readonly: true });
    try {
        await source.backup(databaseCopy);
    } finally {
        source.close();
    }
    const verify = new Database(databaseCopy, { readonly: true });
    try {
        const result = verify.pragma("integrity_check", { simple: true });
        if (result !== "ok") {
            throw new BackupError(`The copied database failed integrity_check: ${String(result)}`);
        }
    } finally {
        verify.close();
    }
    for (const suffix of ["-wal", "-shm"]) {
        await rm(`${databaseCopy}${suffix}`, { force: true });
    }
    const trees: CopiedTree[] = [];
    const wanted = ["saves", "states", ...(options.includeArtwork === true ? ["artwork"] : [])];
    for (const name of wanted) {
        const from = path.join(options.dataRoot, name);
        if (!(await exists(from))) {
            trees.push({ name, files: 0, bytes: 0 });
            continue;
        }
        const to = path.join(directory, name);
        await cp(from, to, { recursive: true });
        trees.push(await measure(to));
    }
    const manifest = {
        createdAt: now.toISOString(),
        databaseBytes: (await stat(databaseCopy)).size,
        includesArtwork: options.includeArtwork === true,
        trees,
        excludes: [".env.local"],
    };
    const manifestPath = path.join(directory, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return {
        directory,
        databaseBytes: manifest.databaseBytes,
        trees,
        manifestPath,
    };
}