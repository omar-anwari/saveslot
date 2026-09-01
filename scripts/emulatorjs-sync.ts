import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { env } from "../lib/config/env.ts";

const REPO = "EmulatorJS/EmulatorJS";
const TARGET_DIR = path.resolve(process.cwd(), "public/emulatorjs");
const VERSION_FILE = path.join(TARGET_DIR, "installed-version.json");

const FLOATING = new Set(["latest", "nightly", "main", "master", "canary", ""]);

interface InstalledVersion {
    version: string;
    sha256: string;
    source: string;
    installedAt: string;
}

async function readInstalled(): Promise<InstalledVersion | null> {
    try {
        return JSON.parse(await readFile(VERSION_FILE, "utf8")) as InstalledVersion;
    } catch {
        return null;
    }
}

async function loaderExists(): Promise<boolean> {
    try {
        await stat(path.join(TARGET_DIR, "data", "loader.js"));
        return true;
    } catch {
        return false;
    }
}

async function findSevenZip(): Promise<string> {
    for (const candidate of ["7zz", "7z", "7za"]) {
        const found = await new Promise<boolean>((resolve) => {
            const child = spawn(candidate, ["--help"], { stdio: "ignore" });
            child.on("error", () => resolve(false));
            child.on("close", () => resolve(true));
        });
        if (found) return candidate;
    }
    throw new Error(
        "No 7-Zip binary found. The EmulatorJS release ships as .7z.\n" +
        "  macOS:  brew install sevenzip\n" +
        "  Debian: apt install p7zip-full",
    );
}

async function fetchAssetDigest(version: string, assetName: string) {
    const response = await fetch(
        `https://api.github.com/repos/${REPO}/releases/tags/v${version}`,
        { headers: { accept: "application/vnd.github+json" } },
    );
    if (!response.ok) return null;
    const release = (await response.json()) as {
        assets?: Array<{ name: string; digest?: string | null; size?: number }>;
    };
    const asset = release.assets?.find((item) => item.name === assetName);
    if (!asset) return null;
    return { digest: asset.digest ?? null, size: asset.size ?? null };
}

async function download(url: string, destination: string): Promise<string> {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok || !response.body) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }
    const total = Number(response.headers.get("content-length") ?? 0);
    const hash = createHash("sha256");
    let received = 0;
    let lastReport = 0;
    const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            hash.update(chunk);
            received += chunk.length;
            if (received - lastReport > 20 * 1024 * 1024) {
                lastReport = received;
                const mb = Math.round(received / 1048576);
                const suffix = total > 0 ? ` / ${Math.round(total / 1048576)} MB` : " MB";
                process.stdout.write(`\r  ${mb}${suffix}`);
            }
            callback(null, chunk);
        },
    });
    await pipeline(
        Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
        meter,
        createWriteStream(destination),
    );
    process.stdout.write("\n");
    return hash.digest("hex");
}

function run(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: "inherit" });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${command} exited with code ${code}`));
        });
    });
}

async function findDataDir(root: string): Promise<string> {
    try {
        await stat(path.join(root, "data", "loader.js"));
        return path.join(root, "data");
    } catch {
    }
    for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(root, entry.name, "data");
        try {
            await stat(path.join(candidate, "loader.js"));
            return candidate;
        } catch {
            continue;
        }
    }
    throw new Error("Could not find data/loader.js in the extracted archive.");
}

async function main(): Promise<number> {
    const { values } = parseArgs({
        options: { check: { type: "boolean", default: false } },
    });
    const version = env.EMULATORJS_VERSION.trim();
    if (FLOATING.has(version.toLowerCase())) {
        console.error(
            version.length === 0
                ? "EMULATORJS_VERSION is not set. Pin an exact release, e.g. 4.2.3."
                : `EMULATORJS_VERSION must be an exact release, not "${version}".`,
        );
        return 2;
    }
    const installed = await readInstalled();
    const ready = installed?.version === version && (await loaderExists());
    if (values.check) {
        if (ready) {
            console.log(`EmulatorJS ${version} is installed.`);
            console.log(`  sha256 ${installed?.sha256}`);
            return 0;
        }
        console.error(
            installed
                ? `Installed ${installed.version}, but ${version} is pinned. Run pnpm emulatorjs:sync.`
                : `EmulatorJS ${version} is not installed. Run pnpm emulatorjs:sync.`,
        );
        return 1;
    }
    if (ready) {
        console.log(`EmulatorJS ${version} is already installed. Nothing to do.`);
        return 0;
    }
    const sevenZip = await findSevenZip();
    const assetName = `${version}.7z`;
    const url = `https://github.com/${REPO}/releases/download/v${version}/${assetName}`;
    const upstream = await fetchAssetDigest(version, assetName);
    if (upstream?.digest) {
        console.log(`Upstream digest: ${upstream.digest}`);
    } else {
        console.warn("No upstream digest published for this asset.");
        console.warn("Recording our own sha256 so a changed artifact is detectable.");
    }
    const workDir = path.join(env.appDataPath, "temp", `emulatorjs-${version}`);
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });
    const archivePath = path.join(workDir, assetName);
    console.log(`Downloading ${url}`);
    const sha256 = await download(url, archivePath);
    console.log(`  sha256 ${sha256}`);
    if (upstream?.digest) {
        const expected = upstream.digest.replace(/^sha256:/, "");
        if (expected !== sha256) {
            console.error("Checksum mismatch. Refusing to install.");
            console.error(`  expected ${expected}`);
            console.error(`  actual   ${sha256}`);
            await rm(workDir, { recursive: true, force: true });
            return 1;
        }
        console.log("Checksum verified.");
    }
    const extractDir = path.join(workDir, "extracted");
    console.log("Extracting…");
    await run(sevenZip, ["x", archivePath, `-o${extractDir}`, "-y"]);
    const dataDir = await findDataDir(extractDir);
    const stagingDir = `${TARGET_DIR}.new`;
    await rm(stagingDir, { recursive: true, force: true });
    await mkdir(stagingDir, { recursive: true });
    await rename(dataDir, path.join(stagingDir, "data"));
    const record: InstalledVersion = {
        version,
        sha256,
        source: url,
        installedAt: new Date().toISOString(),
    };
    await writeFile(
        path.join(stagingDir, "installed-version.json"),
        `${JSON.stringify(record, null, 2)}\n`,
    );
    await rm(TARGET_DIR, { recursive: true, force: true });
    await rename(stagingDir, TARGET_DIR);
    await rm(workDir, { recursive: true, force: true });
    console.log(`\nInstalled EmulatorJS ${version} into public/emulatorjs/`);
    console.log(`  loader: /emulatorjs/data/loader.js`);
    return 0;
}
process.exit(await main());