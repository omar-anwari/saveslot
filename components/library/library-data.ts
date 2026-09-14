import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { games, platforms, saves, saveStates } from "@/db/schema";

export function libraryFacets(platform?: string) {
    const rows = db.select({ genres: games.genresJson, year: games.releaseYear, region: games.region })
        .from(games).innerJoin(platforms, eq(games.platformId, platforms.id))
        .where(and(eq(games.hidden, false), platform ? eq(platforms.slug, platform) : undefined)).all();
    return {
        genres: [...new Set(rows.flatMap((row) => row.genres))].sort((a, b) => a.localeCompare(b)),
        regions: [...new Set(rows.flatMap((row) => row.region ? [row.region] : []))].sort((a, b) => a.localeCompare(b)),
        years: [...new Set(rows.flatMap((row) => row.year === null ? [] : [row.year]))].sort((a, b) => b - a),
    };
}

export function savedGameSlugs(slugs: string[]): Set<string> {
    if (slugs.length === 0) return new Set();
    const rows = db.select({ slug: games.slug }).from(games).where(and(
        inArray(games.slug, slugs),
        sql`(exists (select 1 from ${saves} where ${saves.gameId} = ${games.id}) or exists (select 1 from ${saveStates} where ${saveStates.gameId} = ${games.id}))`,
    )).all();
    return new Set(rows.map((row) => row.slug));
}
