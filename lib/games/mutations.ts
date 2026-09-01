import { eq } from "drizzle-orm";
import { games } from "../../db/schema.ts";
import type { ScanDatabase } from "../scanning/scan-run.ts";
import { getGameDetail, type GameDetail, type PlayStatusValue } from "./query.ts";

export interface GamePatch {
  favourite?: boolean;
  hidden?: boolean;
  playStatus?: PlayStatusValue;
}

export function updateGame(
  db: ScanDatabase,
  slug: string,
  patch: GamePatch,
): GameDetail | null {
  const existing = db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.slug, slug))
    .get();
  if (!existing) return null;
  const changes: Record<string, unknown> = {};
  if (patch.favourite !== undefined) changes.favourite = patch.favourite;
  if (patch.hidden !== undefined) changes.hidden = patch.hidden;
  if (patch.playStatus !== undefined) changes.playStatus = patch.playStatus;
  if (Object.keys(changes).length > 0) {
    changes.updatedAt = new Date();
    db.update(games).set(changes).where(eq(games.slug, slug)).run();
  }
  return getGameDetail(db, slug);
}