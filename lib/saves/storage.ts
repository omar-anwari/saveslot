import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { and, desc, eq } from "drizzle-orm";
import { saves } from "../../db/schema.ts";
import type { ScanDatabase } from "../scanning/scan-run.ts";

export type SaveSource = "emulator" | "upload" | "import" | "backup";

export class PayloadTooLargeError extends Error {
    constructor(limit: number) {
        super(`Save exceeds the configured limit of ${limit} bytes.`);
        this.name = "PayloadTooLargeError";
    }
}

export class EmptySaveError extends Error {
    constructor() {
        super("Refusing to store a zero-byte save.");
        this.name = "EmptySaveError";
    }
}

export interface TempUpload {
    tempPath: string;
    byteSize: number;
    checksumSha256: string;
}

export async function writeUploadToTemp(
    dataRoot: string,
    source: AsyncIterable<Uint8Array>,
    maxBytes: number,
): Promise<TempUpload> {
    const tempDir = path.join(dataRoot, "temp");
    await mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${crypto.randomUUID()}.part`);
    const hash = createHash("sha256");
    let byteSize = 0;
    async function* metered(): AsyncGenerator<Uint8Array> {
        for await (const chunk of source) {
            byteSize += chunk.length;
            if (byteSize > maxBytes) throw new PayloadTooLargeError(maxBytes);
            hash.update(chunk);
            yield chunk;
        }
    }
    try {
        await pipeline(Readable.from(metered()), createWriteStream(tempPath));
    } catch (error) {
        await rm(tempPath, { force: true });
        throw error;
    }
    if (byteSize === 0) {
        await rm(tempPath, { force: true });
        throw new EmptySaveError();
    }
    return { tempPath, byteSize, checksumSha256: hash.digest("hex") };
}

export interface StoreSaveOptions {
    db: ScanDatabase;
    dataRoot: string;
    gameId: number;
    coreKey: string;
    slot: string;
    fileExtension: string;
    upload: TempUpload;
    source: SaveSource;
    historyLimit: number;
    baseChecksum?: string | null;
    screenshotRelativePath?: string | null;
}

export type StoreSaveResult =
    | { status: "stored"; saveId: number; checksumSha256: string }
    | { status: "unchanged"; saveId: number; checksumSha256: string }
    | {
        status: "conflict";
        saveId: number;
        checksumSha256: string;
        currentChecksumSha256: string;
    };

function savePathFor(options: {
    gameId: number;
    coreKey: string;
    slot: string;
    checksum: string;
    extension: string;
    createdAt: Date;
}): string {
    const stamp = options.createdAt.toISOString().replace(/[:.]/g, "-");
    const short = options.checksum.slice(0, 12);
    return path.posix.join(
        "saves",
        "games",
        String(options.gameId),
        options.coreKey,
        options.slot,
        `${stamp}-${short}.${options.extension}`,
    );
}

export async function storeSave(
    options: StoreSaveOptions,
): Promise<StoreSaveResult> {
    const { db, dataRoot, gameId, coreKey, slot, upload } = options;
    const current = db
        .select()
        .from(saves)
        .where(
            and(
                eq(saves.gameId, gameId),
                eq(saves.coreKey, coreKey),
                eq(saves.slot, slot),
                eq(saves.isCurrent, true),
            ),
        )
        .get();
    if (current && current.checksumSha256 === upload.checksumSha256) {
        await rm(upload.tempPath, { force: true });
        return {
            status: "unchanged",
            saveId: current.id,
            checksumSha256: current.checksumSha256,
        };
    }
    const conflicted =
        current !== undefined &&
        options.baseChecksum !== undefined &&
        options.baseChecksum !== null &&
        options.baseChecksum !== current.checksumSha256;
    const createdAt = new Date();
    const relativePath = savePathFor({
        gameId,
        coreKey,
        slot,
        checksum: upload.checksumSha256,
        extension: options.fileExtension,
        createdAt,
    });
    const absolutePath = path.resolve(dataRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await rename(upload.tempPath, absolutePath);
    try {
        const inserted = db.transaction((tx) => {
            if (current && !conflicted) {
                tx.update(saves)
                    .set({ isCurrent: false, updatedAt: createdAt })
                    .where(eq(saves.id, current.id))
                    .run();
            }
            return tx
                .insert(saves)
                .values({
                    gameId,
                    coreKey,
                    slot,
                    fileExtension: options.fileExtension,
                    localRelativePath: relativePath,
                    checksumSha256: upload.checksumSha256,
                    byteSize: upload.byteSize,
                    screenshotRelativePath: options.screenshotRelativePath ?? null,
                    isCurrent: !conflicted,
                    source: options.source,
                    createdAt,
                    updatedAt: createdAt,
                })
                .returning({ id: saves.id })
                .get();
        });
        await pruneSaveHistory(db, dataRoot, gameId, coreKey, slot, options.historyLimit);
        if (conflicted && current) {
            return {
                status: "conflict",
                saveId: inserted.id,
                checksumSha256: upload.checksumSha256,
                currentChecksumSha256: current.checksumSha256,
            };
        }
        return {
            status: "stored",
            saveId: inserted.id,
            checksumSha256: upload.checksumSha256,
        };
    } catch (error) {
        await rm(absolutePath, { force: true });
        throw error;
    }
}

export async function pruneSaveHistory(
    db: ScanDatabase,
    dataRoot: string,
    gameId: number,
    coreKey: string,
    slot: string,
    limit: number,
): Promise<number> {
    const history = db
        .select({ id: saves.id, localRelativePath: saves.localRelativePath })
        .from(saves)
        .where(
            and(
                eq(saves.gameId, gameId),
                eq(saves.coreKey, coreKey),
                eq(saves.slot, slot),
                eq(saves.isCurrent, false),
            ),
        )
        .orderBy(desc(saves.createdAt), desc(saves.id))
        .all();
    const doomed = history.slice(limit);
    for (const row of doomed) {
        await rm(path.resolve(dataRoot, row.localRelativePath), { force: true });
        db.delete(saves).where(eq(saves.id, row.id)).run();
    }
    return doomed.length;
}

export function listSaves(
    db: ScanDatabase,
    gameId: number,
    coreKey?: string,
) {
    return db
        .select()
        .from(saves)
        .where(
            coreKey
                ? and(eq(saves.gameId, gameId), eq(saves.coreKey, coreKey))
                : eq(saves.gameId, gameId),
        )
        .orderBy(desc(saves.isCurrent), desc(saves.createdAt))
        .all();
}

export function currentSave(
    db: ScanDatabase,
    gameId: number,
    coreKey: string,
    slot = "main",
) {
    return db
        .select()
        .from(saves)
        .where(
            and(
                eq(saves.gameId, gameId),
                eq(saves.coreKey, coreKey),
                eq(saves.slot, slot),
                eq(saves.isCurrent, true),
            ),
        )
        .get();
}