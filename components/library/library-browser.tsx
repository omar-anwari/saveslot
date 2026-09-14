import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/db/client";
import { GameCard } from "@/components/library/game-card";
import { GameList } from "@/components/library/game-list";
import { LibraryFilters } from "@/components/library/library-filters";
import { BrowseIcon } from "@/components/library/browse-icon";
import { libraryFacets, savedGameSlugs } from "@/components/library/library-data";
import { availablePlatforms } from "@/lib/platforms/available";
import { GAME_SORTS, PLAY_STATUS_VALUES, queryGames, type GameSort, type PlayStatusValue } from "@/lib/games/query";

export type LibrarySearchParams = Record<string, string | string[] | undefined>;
export const SORT_LABELS: Record<GameSort, string> = {
    title: "Title A–Z",
    "recently-added": "Recently added",
    "last-played": "Recently played",
    "release-year": "Release year",
    playtime: "Most played",
    random: "Random",
};
export function readParam(value: string | string[] | undefined): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function LibraryBrowser({ params, favoritesOnly = false }: { params: LibrarySearchParams; favoritesOnly?: boolean }) {
    const q = readParam(params.q);
    const platform = readParam(params.platform);
    const genre = readParam(params.genre);
    const region = readParam(params.region);
    const yearParam = Number.parseInt(readParam(params.year) ?? "", 10);
    const year = Number.isInteger(yearParam) ? yearParam : undefined;
    const favourite = favoritesOnly || readParam(params.favourite) === "true" ? true : undefined;
    const statusParam = readParam(params.status);
    const status = (PLAY_STATUS_VALUES as readonly string[]).includes(statusParam ?? "") ? statusParam as PlayStatusValue : undefined;
    const includeHidden = readParam(params.hidden) === "include";
    const view = readParam(params.view) === "list" ? "list" : "grid";
    const sortParam = readParam(params.sort);
    const sort: GameSort = (GAME_SORTS as readonly string[]).includes(sortParam ?? "") ? sortParam as GameSort : "title";
    const pageParam = Number.parseInt(readParam(params.page) ?? "1", 10);
    const requestedPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const query = { q, platform, genre, region, year, favourite, status, includeHidden, sort, pageSize: 48 };
    let result = queryGames(db, { ...query, page: requestedPage });
    const page = Math.min(requestedPage, result.pageCount);
    if (page !== requestedPage) result = queryGames(db, { ...query, page });
    const platformRows = availablePlatforms(db).filter((row) => row.gameCount > 0).map((row) => ({ slug: row.slug, name: row.name }));
    const facets = libraryFacets();
    const saves = savedGameSlugs(result.games.map((game) => game.slug));
    const basePath = favoritesOnly ? "/favorites" : "/library";
    const carried = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (key !== "page" && typeof value === "string" && value.length > 0) carried.set(key, value);
    }
    const pageHref = (target: number) => {
        const next = new URLSearchParams(carried);
        if (target > 1) next.set("page", String(target));
        const query = next.toString();
        return query.length > 0 ? `${basePath}?${query}` : basePath;
    };
    const filtered = Boolean(q || platform || genre || region || year || status || includeHidden || (!favoritesOnly && favourite));
    return (
        <div className="page-shell">
            <header className="page-header">
                <div><p className="eyebrow">Your collection</p><h1>{favoritesOnly ? "Favorites" : "Library"}</h1><p className="mt-2 text-sm text-muted">{favoritesOnly ? "The games you always come back to." : "Every game. One place. Yours to explore."}</p></div>
                <Link href={favoritesOnly ? "/library" : "/settings?tab=library"} className="button-secondary">{favoritesOnly ? "Browse library" : "Add games"}<BrowseIcon name="arrow" width="15" height="15" /></Link>
            </header>
            <div className="mb-5 flex items-center gap-3"><h2 className="text-base font-medium">{favoritesOnly ? "Your favorites" : "All games"}</h2><span className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs tabular-nums text-muted">{result.total.toLocaleString()}</span></div>
            <Suspense fallback={<div className="h-32 animate-pulse rounded-md bg-surface" />}><LibraryFilters platforms={platformRows} {...facets} sorts={GAME_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))} favoritesOnly={favoritesOnly} /></Suspense>
            {result.games.length === 0 ? (
                <div className="empty-state mt-8">
                    <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-line bg-surface text-accent-hover"><BrowseIcon name={favoritesOnly ? "heart" : "grid"} width="25" height="25" /></span>
                    <h2 className="text-lg font-medium">{filtered ? "No games found" : favoritesOnly ? "Keep your favorites close" : "Your next adventure starts here"}</h2>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{filtered ? "Try another search or clear your filters to see more of your library." : favoritesOnly ? "Tap the heart on any game to give it a place in your favorites." : "Add your game folder in Settings, then scan it to build your library."}</p>
                    <Link href={filtered ? basePath : favoritesOnly ? "/library" : "/settings?tab=library"} className="button-primary mt-6">{filtered ? "Clear filters" : favoritesOnly ? "Explore your library" : "Add your games"}<BrowseIcon name="arrow" width="15" height="15" /></Link>
                </div>
            ) : <div className="mt-6">{view === "list" ? <GameList games={result.games} /> : <ul className="game-grid">{result.games.map((game) => <GameCard key={game.slug} {...game} hasSave={saves.has(game.slug)} />)}</ul>}</div>}
            {result.pageCount > 1 ? <nav aria-label="Pagination" className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6 text-sm">
                {page > 1 ? <Link href={pageHref(page - 1)} className="button-secondary">← Previous</Link> : <span className="px-4 text-xs text-subtle">First page</span>}
                <span className="text-xs text-muted tabular-nums">Page {page} of {result.pageCount}</span>
                {page < result.pageCount ? <Link href={pageHref(page + 1)} className="button-secondary">Next →</Link> : <span className="px-4 text-xs text-subtle">Last page</span>}
            </nav> : null}
        </div>
    );
}
