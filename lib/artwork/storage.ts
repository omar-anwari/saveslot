import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Derivative } from "./derive.ts";

export const ARTWORK_DIRECTORY = "artwork";

export class ArtworkStorageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ArtworkStorageError";
    }
}

export interface StoredDerivative {
    name: string;
    relativePath: string;
    width: number;
    height: number;
    byteSize: number;
    deduped: boolean;
}

export function contentHash(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

export function artworkRelativePath(name: string, hash: string): string {
    if (!/^[a-z0-9]+$/.test(name)) {
        throw new ArtworkStorageError(`Invalid derivative name "${name}".`);
    }
    if (!/^[0-9a-f]{64}$/.test(hash)) {
        throw new ArtworkStorageError("Invalid content hash.");
    }
    return path.posix.join(ARTWORK_DIRECTORY, name, hash.slice(0, 2), `${hash}.webp`);
}

async function exists(absolutePath: string): Promise<boolean> {
    try {
        await stat(absolutePath);
        return true;
    } catch {
        return false;
    }
}

export async function storeDerivatives(
    dataRoot: string,
    derivatives: readonly Derivative[],
): Promise<StoredDerivative[]> {
    const stored: StoredDerivative[] = [];
    for (const derivative of derivatives) {
        const hash = contentHash(derivative.bytes);
        const relativePath = artworkRelativePath(derivative.name, hash);
        const absolutePath = path.join(dataRoot, relativePath);
        if (await exists(absolutePath)) {
            stored.push({
                name: derivative.name,
                relativePath,
                width: derivative.width,
                height: derivative.height,
                byteSize: derivative.bytes.byteLength,
                deduped: true,
            });
            continue;
        }
        await mkdir(path.dirname(absolutePath), { recursive: true });
        const temporary = `${absolutePath}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporary, derivative.bytes);
            await rename(temporary, absolutePath);
        } catch (error) {
            await rm(temporary, { force: true });
            throw error;
        }
        stored.push({
            name: derivative.name,
            relativePath,
            width: derivative.width,
            height: derivative.height,
            byteSize: derivative.bytes.byteLength,
            deduped: false,
        });
    }
    return stored;
}

export function resolveArtworkPath(dataRoot: string, relativePath: string): string {
    const root = path.resolve(dataRoot, ARTWORK_DIRECTORY);
    const absolute = path.resolve(dataRoot, relativePath);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) {
        throw new ArtworkStorageError(`Path escapes the artwork directory: ${relativePath}`);
    }
    return absolute;
}