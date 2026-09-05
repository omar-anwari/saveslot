import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { games, platforms } from "../../db/schema.ts";
import {
    createTestDatabase,
    seedTestPlatforms,
    type TestDatabaseHandle,
} from "../../tests/helpers/test-db.ts";
import {
    endSession,
    getSession,
    heartbeat,
    reapStaleSessions,
    startSession,
} from "./sessions.ts";

let handle: TestDatabaseHandle;
let gameId = 0;

const T0 = new Date("2026-09-05T12:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

function game() {
    return handle.db.select().from(games).where(eq(games.id, gameId)).get();
}

function begin() {
    return startSession(
        handle.db,
        { gameId, coreKey: "snes9x", clientId: "browser-a" },
        T0,
    );
}

beforeEach(() => {
    handle = createTestDatabase();
    seedTestPlatforms(handle.db);
    const platform = handle.db
        .select({ id: platforms.id })
        .from(platforms)
        .where(eq(platforms.slug, "snes"))
        .get();
    gameId = handle.db
        .insert(games)
        .values({
            platformId: platform!.id,
            slug: "snes-test",
            title: "Test",
            sortTitle: "test",
            filenameTitle: "Test",
        })
        .returning({ id: games.id })
        .get().id;
});

afterEach(() => {
    handle.close();
});

describe("startSession", () => {
    it("opens a session and marks the game as played", () => {
        const id = begin();
        const session = getSession(handle.db, id);
        expect(session?.durationSeconds).toBe(0);
        expect(session?.endedAt).toBeNull();
        expect(session?.clientId).toBe("browser-a");
        expect(game()?.lastPlayedAt).toEqual(T0);
        expect(game()?.totalPlaySeconds).toBe(0);
    });
});

describe("heartbeat", () => {
    it("credits a plausible gap", () => {
        const id = begin();
        const result = heartbeat(handle.db, id, at(30));
        expect(result?.creditedSeconds).toBe(30);
        expect(result?.durationSeconds).toBe(30);
        expect(game()?.totalPlaySeconds).toBe(30);
    });

    it("accumulates across heartbeats", () => {
        const id = begin();
        heartbeat(handle.db, id, at(30));
        heartbeat(handle.db, id, at(60));
        const result = heartbeat(handle.db, id, at(90));
        expect(result?.durationSeconds).toBe(90);
        expect(game()?.totalPlaySeconds).toBe(90);
    });
    it("credits nothing for an implausible gap", () => {
        const id = begin();
        const result = heartbeat(handle.db, id, at(3600));
        expect(result?.creditedSeconds).toBe(0);
        expect(result?.durationSeconds).toBe(0);
        expect(game()?.totalPlaySeconds).toBe(0);
    });
    it("resumes crediting after an implausible gap", () => {
        const id = begin();
        heartbeat(handle.db, id, at(3600));
        const result = heartbeat(handle.db, id, at(3630));
        expect(result?.creditedSeconds).toBe(30);
        expect(game()?.totalPlaySeconds).toBe(30);
    });
    it("returns null for an unknown or ended session", () => {
        expect(heartbeat(handle.db, "nope", at(30))).toBeNull();
        const id = begin();
        endSession(handle.db, id, "normal_exit", at(30));
        expect(heartbeat(handle.db, id, at(60))).toBeNull();
    });
});

describe("endSession", () => {
    it("credits the final stretch and records the reason", () => {
        const id = begin();
        heartbeat(handle.db, id, at(30));
        const ended = endSession(handle.db, id, "save_and_quit", at(50));
        expect(ended?.durationSeconds).toBe(50);
        expect(ended?.exitReason).toBe("save_and_quit");
        expect(ended?.endedAt).toEqual(at(50));
        expect(game()?.totalPlaySeconds).toBe(50);
    });
    it("does not credit twice when ended twice", () => {
        const id = begin();
        endSession(handle.db, id, "normal_exit", at(40));
        endSession(handle.db, id, "normal_exit", at(80));
        expect(game()?.totalPlaySeconds).toBe(40);
    });
    it("returns null for an unknown session", () => {
        expect(endSession(handle.db, "nope", "normal_exit")).toBeNull();
    });
});

describe("reapStaleSessions", () => {
    it("closes abandoned sessions without crediting the gap", () => {
        const id = begin();
        heartbeat(handle.db, id, at(30));
        expect(reapStaleSessions(handle.db, at(3600))).toBe(1);
        const session = getSession(handle.db, id);
        expect(session?.exitReason).toBe("timeout");
        expect(session?.endedAt).toEqual(at(3600));
        expect(session?.durationSeconds).toBe(30);
        expect(game()?.totalPlaySeconds).toBe(30);
    });
    it("leaves a recently active session alone", () => {
        begin();
        heartbeat(handle.db, begin(), at(30));
        expect(reapStaleSessions(handle.db, at(60))).toBe(0);
    });
});