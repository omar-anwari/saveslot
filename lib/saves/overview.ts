import { desc, eq } from "drizzle-orm";
import { games, platforms, saveStates, saves } from "../../db/schema.ts";
import type { ScanDatabase } from "../scanning/scan-run.ts";

export type SaveKind = "battery" | "autosave" | "manual";
export interface SaveEntry {
    kind: SaveKind;
    key: string;
    gameSlug: string;
    gameTitle: string;
    platformName: string;
    label: string;
    byteSize: number;
    createdAt: Date;
    screenshotUrl: string | null;
}

export function listAllSaves(db: ScanDatabase, limit = 400): SaveEntry[] {
    const battery = db
        .select({
            id: saves.id,
            coreKey: saves.coreKey,
            slot: saves.slot,
            byteSize: saves.byteSize,
            createdAt: saves.createdAt,
            isCurrent: saves.isCurrent,
            gameSlug: games.slug,
            gameTitle: games.title,
            platformName: platforms.name,
        })
        .from(saves)
        .innerJoin(games, eq(saves.gameId, games.id))
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .orderBy(desc(saves.createdAt))
        .limit(limit)
        .all()
        .map<SaveEntry>((row) => ({
            kind: "battery",
            key: `battery-${row.id}`,
            gameSlug: row.gameSlug,
            gameTitle: row.gameTitle,
            platformName: row.platformName,
            label: `${row.coreKey} · ${row.slot}${row.isCurrent ? " · current" : ""}`,
            byteSize: row.byteSize,
            createdAt: row.createdAt,
            screenshotUrl: null,
        }));

    const states = db
        .select({
            id: saveStates.id,
            label: saveStates.label,
            isAutosave: saveStates.isAutosave,
            byteSize: saveStates.byteSize,
            createdAt: saveStates.createdAt,
            screenshot: saveStates.screenshotRelativePath,
            gameSlug: games.slug,
            gameTitle: games.title,
            platformName: platforms.name,
        })
        .from(saveStates)
        .innerJoin(games, eq(saveStates.gameId, games.id))
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .orderBy(desc(saveStates.createdAt))
        .limit(limit)
        .all()
        .map<SaveEntry>((row) => ({
            kind: row.isAutosave ? "autosave" : "manual",
            key: `state-${row.id}`,
            gameSlug: row.gameSlug,
            gameTitle: row.gameTitle,
            platformName: row.platformName,
            label: row.label ?? (row.isAutosave ? "Autosave" : "Save state"),
            byteSize: row.byteSize,
            createdAt: row.createdAt,
            screenshotUrl: row.screenshot === null ? null : `/api/states/${row.id}/screenshot`,
        }));
    return [...battery, ...states].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
}