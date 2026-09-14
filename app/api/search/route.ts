import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { artworkUrl } from "@/lib/artwork/url";
import { queryGames } from "@/lib/games/query";
import { availablePlatforms } from "@/lib/platforms/available";
import { SMART_COLLECTIONS } from "@/lib/collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_LENGTH = 2;
const GAME_LIMIT = 6;
const SYSTEM_LIMIT = 4;

export async function GET(request: Request) {
    const term = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (term.length < MIN_LENGTH) {
        return NextResponse.json({ games: [], systems: [], collections: [] });
    }
    const games = queryGames(db, { q: term, sort: "title", pageSize: GAME_LIMIT }).games.map(
        (game) => ({
            slug: game.slug,
            title: game.title,
            platformName: game.platformName,
            platformSlug: game.platformSlug,
            releaseYear: game.releaseYear,
            coverUrl: artworkUrl(game.coverThumbPath),
        }),
    );
    const needle = term.toLowerCase();
    const systems = availablePlatforms(db)
        .filter(
            (platform) =>
                platform.gameCount > 0 &&
                (platform.name.toLowerCase().includes(needle) ||
                    platform.slug.includes(needle) ||
                    platform.folderAliasesJson.some((alias) => alias.includes(needle))),
        )
        .slice(0, SYSTEM_LIMIT)
        .map((platform) => ({
            slug: platform.slug,
            name: platform.name,
            gameCount: platform.gameCount,
        }));
    const collections = SMART_COLLECTIONS.filter((collection) => collection.name.toLowerCase().includes(needle))
        .map((collection) => ({ name: collection.name, href: collection.href, gameCount: queryGames(db, { ...collection.query, pageSize: 1 }).total }));
    return NextResponse.json(
        { games, systems, collections },
        { headers: { "cache-control": "no-store" } },
    );
}
