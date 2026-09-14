import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { gameFiles, games, playSessions, saveStates, saves } from "../../db/schema.ts";
import { resolveWithinRoot } from "../filesystem/paths.ts";
import type { MetadataDatabase } from "../metadata/lookup-cache.ts";

export interface RemovableGame {
    id: number;
    slug: string;
    title: string;
    files: number;
    presentFiles: number;
    saves: number;
    states: number;
}

export interface RemoveGameResult {
    outcome: "removed" | "blocked" | "not-found";
    reason: string | null;
    game: RemovableGame | null;
    deletedBlobs: number;
}

function describe(db: MetadataDatabase, gameId: number): RemovableGame | null {
    const game = db
        .select({ id: games.id, slug: games.slug, title: games.title })
        .from(games)
        .where(eq(games.id, gameId))
        .get();
    if (game === undefined) return null;
    const files = db.select().from(gameFiles).where(eq(gameFiles.gameId, gameId)).all();
    return {
        ...game,
        files: files.length,
        presentFiles: files.filter((file) => file.present).length,
        saves: db.select().from(saves).where(eq(saves.gameId, gameId)).all().length,
        states: db.select().from(saveStates).where(eq(saveStates.gameId, gameId)).all().length,
    };
}

export function listRemovable(db: MetadataDatabase): RemovableGame[] {
    return db
        .select({ id: games.id })
        .from(games)
        .all()
        .flatMap((row) => {
            const game = describe(db, row.id);
            return game !== null && game.presentFiles === 0 ? [game] : [];
        });
}

export interface RemoveOptions {
    dataRoot: string;
    force?: boolean;
}

export async function removeGame(
    db: MetadataDatabase,
    gameId: number,
    options: RemoveOptions,
): Promise<RemoveGameResult> {
    const game = describe(db, gameId);
    if (game === null) {
        return { outcome: "not-found", reason: null, game: null, deletedBlobs: 0 };
    }
    if (game.presentFiles > 0 && options.force !== true) {
        return {
            outcome: "blocked",
            reason:
                "Its file is still on disk, so the next scan would add it back. Hide it instead, or remove the file first.",
            game,
            deletedBlobs: 0,
        };
    }
    if ((game.saves > 0 || game.states > 0) && options.force !== true) {
        return {
            outcome: "blocked",
            reason: `It has ${game.saves} save(s) and ${game.states} state(s), which would be deleted too.`,
            game,
            deletedBlobs: 0,
        };
    }
    const blobs = [
        ...db.select().from(saves).where(eq(saves.gameId, gameId)).all()
            .flatMap((save) => [save.localRelativePath, save.screenshotRelativePath]),
        ...db.select().from(saveStates).where(eq(saveStates.gameId, gameId)).all()
            .flatMap((state) => [state.localRelativePath, state.screenshotRelativePath]),
    ].flatMap((value) => (typeof value === "string" && value.length > 0 ? [value] : []));
    db.transaction((tx) => {
        tx.delete(playSessions).where(eq(playSessions.gameId, gameId)).run();
        tx.delete(saveStates).where(eq(saveStates.gameId, gameId)).run();
        tx.delete(saves).where(eq(saves.gameId, gameId)).run();
        tx.delete(gameFiles).where(eq(gameFiles.gameId, gameId)).run();
        tx.delete(games).where(eq(games.id, gameId)).run();
    });
    let deletedBlobs = 0;
    for (const blob of blobs) {
        try {
            await rm(resolveWithinRoot(options.dataRoot, blob), { force: true });
            deletedBlobs += 1;
        } catch {
        }
    }
    return { outcome: "removed", reason: null, game, deletedBlobs };
}