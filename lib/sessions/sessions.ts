import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { games, playSessions } from "../../db/schema.ts";
import type { ScanDatabase } from "../scanning/scan-run.ts";

export const HEARTBEAT_INTERVAL_SECONDS = 30;
export const MAX_CREDIT_GAP_SECONDS = 90;
export const STALE_AFTER_SECONDS = 300;
export type ExitReason =
    | "save_and_quit"
    | "normal_exit"
    | "navigation"
    | "timeout"
    | "crash"
    | "unknown";

function secondsBetween(from: Date, to: Date): number {
    return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

function creditGame(
    db: ScanDatabase,
    gameId: number,
    seconds: number,
    now: Date,
): void {
    if (seconds <= 0) return;
    db.update(games)
        .set({
            totalPlaySeconds: sql`${games.totalPlaySeconds} + ${seconds}`,
            lastPlayedAt: now,
            updatedAt: now,
        })
        .where(eq(games.id, gameId))
        .run();
}

export interface StartSessionOptions {
    gameId: number;
    coreKey: string;
    clientId: string;
}

export function startSession(
    db: ScanDatabase,
    options: StartSessionOptions,
    now: Date = new Date(),
): string {
    const id = crypto.randomUUID();
    db.insert(playSessions)
        .values({
            id,
            gameId: options.gameId,
            coreKey: options.coreKey,
            clientId: options.clientId,
            startedAt: now,
            lastHeartbeatAt: now,
            durationSeconds: 0,
            exitReason: "unknown",
        })
        .run();
    db.update(games)
        .set({ lastPlayedAt: now, updatedAt: now })
        .where(eq(games.id, options.gameId))
        .run();
    return id;
}

export function getSession(db: ScanDatabase, sessionId: string) {
    return db
        .select()
        .from(playSessions)
        .where(eq(playSessions.id, sessionId))
        .get();
}

export interface HeartbeatResult {
    creditedSeconds: number;
    durationSeconds: number;
}

export function heartbeat(
    db: ScanDatabase,
    sessionId: string,
    now: Date = new Date(),
): HeartbeatResult | null {
    const session = getSession(db, sessionId);
    if (!session || session.endedAt !== null) return null;
    const gap = secondsBetween(session.lastHeartbeatAt, now);
    const credited = gap <= MAX_CREDIT_GAP_SECONDS ? gap : 0;
    const durationSeconds = session.durationSeconds + credited;
    db.update(playSessions)
        .set({ lastHeartbeatAt: now, durationSeconds, updatedAt: now })
        .where(eq(playSessions.id, sessionId))
        .run();
    creditGame(db, session.gameId, credited, now);
    return { creditedSeconds: credited, durationSeconds };
}

export function endSession(
    db: ScanDatabase,
    sessionId: string,
    exitReason: ExitReason,
    now: Date = new Date(),
) {
    const session = getSession(db, sessionId);
    if (!session) return null;
    if (session.endedAt !== null) return session;
    const gap = secondsBetween(session.lastHeartbeatAt, now);
    const credited = gap <= MAX_CREDIT_GAP_SECONDS ? gap : 0;
    const durationSeconds = session.durationSeconds + credited;
    db.update(playSessions)
        .set({
            endedAt: now,
            lastHeartbeatAt: now,
            durationSeconds,
            exitReason,
            updatedAt: now,
        })
        .where(eq(playSessions.id, sessionId))
        .run();
    creditGame(db, session.gameId, credited, now);
    return getSession(db, sessionId);
}

export function reapStaleSessions(
    db: ScanDatabase,
    now: Date = new Date(),
): number {
    const cutoff = new Date(now.getTime() - STALE_AFTER_SECONDS * 1000);
    const stale = db
        .select({ id: playSessions.id })
        .from(playSessions)
        .where(
            and(isNull(playSessions.endedAt), lt(playSessions.lastHeartbeatAt, cutoff)),
        )
        .all();
    for (const row of stale) {
        db.update(playSessions)
            .set({ endedAt: now, exitReason: "timeout", updatedAt: now })
            .where(eq(playSessions.id, row.id))
            .run();
    }
    return stale.length;
}