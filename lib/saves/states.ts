import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { saveStates } from "../../db/schema.ts";
import type { ScanDatabase } from "../scanning/scan-run";
import type { TempUpload } from "./storage";

export interface StoreStateOptions {
    db: ScanDatabase;
    dataRoot: string;
    gameId: number;
    coreKey: string;
    coreVersion?: string | null;
    slot?: string | null;
    label?: string | null;
    isAutosave?: boolean;
    upload: TempUpload;
    screenshot?: TempUpload | null;
    manualLimit: number;
    autosaveLimit: number;
}

function statePath(gameId: number, coreKey: string, stateId: string): string {
    return path.posix.join(
        "states",
        "games",
        String(gameId),
        coreKey,
        `${stateId}.state`
    );
}

function screenshotPath(gameId: number, coreKey: string, stateId: string): string {
    return path.posix.join(
        "states",
        "games",
        String(gameId),
        coreKey,
        `${stateId}.png`
    );
}

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function defaultLabel(at: Date): string {
    const month = MONTHS[at.getMonth()] ?? "";
    const hours24 = at.getHours();
    const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const minutes = String(at.getMinutes()).padStart(2, "0");
    const suffix = hours24 < 12 ? "AM" : "PM";

    return `${month} ${at.getDate()}, ${at.getFullYear()} · ${hours}:${minutes} ${suffix}`;
}

export async function storeState(options: StoreStateOptions): Promise<string> {
    const { db, dataRoot, gameId, coreKey, upload } = options;
    const stateId = crypto.randomUUID();
    const createdAt = new Date();
    const isAutosave = options.isAutosave ?? false;
    const relativePath = statePath(gameId, coreKey, stateId);
    const absolutePath = path.resolve(dataRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await rename(upload.tempPath, absolutePath);
    let screenshotRelativePath: string | null = null;
    if (options.screenshot) {
        screenshotRelativePath = screenshotPath(gameId, coreKey, stateId);
        await rename(
            options.screenshot.tempPath,
            path.resolve(dataRoot, screenshotRelativePath),
        );
    }
    try {
        db.insert(saveStates)
            .values({
                id: stateId,
                gameId,
                coreKey,
                coreVersion: options.coreVersion ?? null,
                slot: options.slot ?? null,
                label: options.label ?? defaultLabel(createdAt),
                localRelativePath: relativePath,
                screenshotRelativePath,
                checksumSha256: upload.checksumSha256,
                byteSize: upload.byteSize,
                isAutosave,
                createdAt,
                updatedAt: createdAt,
            })
            .run();
    } catch (error) {
        await rm(absolutePath, { force: true });
        if (screenshotRelativePath) {
            await rm(path.resolve(dataRoot, screenshotRelativePath), { force: true });
        }
        throw error;
    }
    await pruneStates(
        db,
        dataRoot,
        gameId,
        coreKey,
        isAutosave,
        isAutosave ? options.autosaveLimit : options.manualLimit,
    );
    return stateId;
}

export async function pruneStates(
    db: ScanDatabase,
    dataRoot: string,
    gameId: number,
    coreKey: string,
    isAutosave: boolean,
    limit: number,
): Promise<number> {
    const rows = db
        .select({
            id: saveStates.id,
            localRelativePath: saveStates.localRelativePath,
            screenshotRelativePath: saveStates.screenshotRelativePath,
        })
        .from(saveStates)
        .where(
            and(
                eq(saveStates.gameId, gameId),
                eq(saveStates.coreKey, coreKey),
                eq(saveStates.isAutosave, isAutosave),
            ),
        )
        .orderBy(desc(saveStates.createdAt), desc(saveStates.id))
        .all();
    const doomed = rows.slice(limit);
    for (const row of doomed) {
        await rm(path.resolve(dataRoot, row.localRelativePath), { force: true });
        if (row.screenshotRelativePath) {
            await rm(path.resolve(dataRoot, row.screenshotRelativePath), {
                force: true,
            });
        }
        db.delete(saveStates).where(eq(saveStates.id, row.id)).run();
    }
    return doomed.length;
}

export function listStates(
    db: ScanDatabase,
    gameId: number,
    coreKey?: string,
) {
    return db
        .select()
        .from(saveStates)
        .where(
            coreKey
                ? and(eq(saveStates.gameId, gameId), eq(saveStates.coreKey, coreKey))
                : eq(saveStates.gameId, gameId),
        )
        .orderBy(desc(saveStates.createdAt))
        .all();
}

export function getSaveState(db: ScanDatabase, stateId: string) {
    return db
        .select()
        .from(saveStates)
        .where(eq(saveStates.id, stateId))
        .get();
}

export function updateSaveState(
    db: ScanDatabase,
    stateId: string,
    patch: { label?: string; slot?: string | null },
) {
    const existing = getSaveState(db, stateId);
    if (!existing) return null;
    const changes: Record<string, unknown> = {};
    if (patch.label !== undefined) changes.label = patch.label;
    if (patch.slot !== undefined) changes.slot = patch.slot;
    if (Object.keys(changes).length > 0) {
        changes.updatedAt = new Date();
        db.update(saveStates)
            .set(changes)
            .where(eq(saveStates.id, stateId))
            .run();
    }
    return getSaveState(db, stateId);
}

export async function deleteSaveState(
    db: ScanDatabase,
    dataRoot: string,
    stateId: string,
): Promise<boolean> {
    const state = getSaveState(db, stateId);
    if (!state) return false;
    db.delete(saveStates).where(eq(saveStates.id, stateId)).run();
    await rm(path.resolve(dataRoot, state.localRelativePath), { force: true });
    if (state.screenshotRelativePath) {
        await rm(path.resolve(dataRoot, state.screenshotRelativePath), {
            force: true,
        });
    }
    return true;
}