import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { isWithinRoot, toPosixRelative } from "../filesystem/paths.ts";
import {
    platformForFolderName,
    type PlatformDefinition,
} from "../platforms/registry.ts";

export interface DiscoveredFile {
    platformSlug: string;
    relativePath: string;
    fileName: string;
    extension: string;
    sizeBytes: number;
    modifiedAtFs: Date;
}

export type WalkWarningType =
    | "unknown-platform-folder"
    | "symlink-escape"
    | "unreadable-directory";

export interface WalkWarning {
    type: WalkWarningType;
    relativePath: string;
    message: string;
}

export interface WalkResult {
    files: DiscoveredFile[];
    warnings: WalkWarning[];
}

export interface WalkOptions {
    platformSlug?: string;
}

const RESERVED_ROOT_DIRECTORIES = new Set(["bios"]);

interface WalkContext {
    libraryRoot: string;
    realRoot: string;
    files: DiscoveredFile[];
    warnings: WalkWarning[];
    visited: Set<string>;
}

export async function walkLibrary(
    libraryRoot: string,
    options: WalkOptions = {},
): Promise<WalkResult> {
    const context: WalkContext = {
        libraryRoot,
        realRoot: await realpath(libraryRoot),
        files: [],
        warnings: [],
        visited: new Set(),
    };
    const entries = await readdir(libraryRoot, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const absolute = path.join(libraryRoot, entry.name);
        const stats = await safeStat(absolute);
        if (!stats?.isDirectory()) continue;
        if (RESERVED_ROOT_DIRECTORIES.has(entry.name.toLowerCase())) continue;
        const platform = platformForFolderName(entry.name);
        if (!platform) {
            context.warnings.push({
                type: "unknown-platform-folder",
                relativePath: entry.name,
                message: `"${entry.name}" does not match any known platform folder alias.`,
            });
            continue;
        }
        if (options.platformSlug && platform.slug !== options.platformSlug) continue;
        await walkDirectory(context, absolute, platform);
    }
    context.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return { files: context.files, warnings: context.warnings };
}

async function safeStat(target: string) {
    try {
        return await stat(target);
    } catch {
        return null;
    }
}

async function walkDirectory(
    context: WalkContext,
    absoluteDir: string,
    platform: PlatformDefinition,
): Promise<void> {
    let entries;
    try {
        entries = await readdir(absoluteDir, { withFileTypes: true });
    } catch {
        context.warnings.push({
            type: "unreadable-directory",
            relativePath: toPosixRelative(context.libraryRoot, absoluteDir),
            message: "Directory could not be read.",
        });
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const absolute = path.join(absoluteDir, entry.name);
        const relativePath = toPosixRelative(context.libraryRoot, absolute);
        if (entry.isSymbolicLink()) {
            const real = await safeRealpath(absolute);
            if (!real || !isWithinRoot(context.realRoot, real)) {
                context.warnings.push({
                    type: "symlink-escape",
                    relativePath,
                    message: "Symlink resolves outside the library root; skipped.",
                });
                continue;
            }
        }
        const stats = await safeStat(absolute);
        if (!stats) continue;
        if (stats.isDirectory()) {
            const real = (await safeRealpath(absolute)) ?? absolute;
            if (context.visited.has(real)) continue;
            context.visited.add(real);
            await walkDirectory(context, absolute, platform);
            continue;
        }
        if (!stats.isFile()) continue;
        const extension = path.extname(entry.name).toLowerCase();
        if (extension.length === 0) continue;
        if (!platform.extensions.includes(extension)) continue;
        context.files.push({
            platformSlug: platform.slug,
            relativePath,
            fileName: entry.name,
            extension,
            sizeBytes: stats.size,
            modifiedAtFs: new Date(Math.floor(stats.mtimeMs / 1000) * 1000),
        });
    }
}

async function safeRealpath(target: string): Promise<string | null> {
    try {
        return await realpath(target);
    } catch {
        return null;
    }
}