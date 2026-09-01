import { asc } from "drizzle-orm";
import Link from "next/link";
import { PlaceholderCover } from "@/components/library/placeholder-cover";
import { db } from "@/db/client";
import { platforms } from "@/db/schema";
import { GAME_SORTS, queryGames, type GameSort } from "@/lib/games/query";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Library",
};

const PAGE_SIZE = 24;

const SORT_LABELS: Record<GameSort, string> = {
    title: "Title",
    "recently-added": "Recently added",
    "last-played": "Last played",
    "release-year": "Release year",
    playtime: "Playtime",
    random: "Random",
};

function readParam(
    value: string | string[] | undefined,
): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default async function LibraryPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const q = readParam(params.q);
    const platform = readParam(params.platform);
    const sortParam = readParam(params.sort);
    const sort: GameSort =
        sortParam && (GAME_SORTS as readonly string[]).includes(sortParam)
            ? (sortParam as GameSort)
            : "title";
    const pageParam = Number.parseInt(readParam(params.page) ?? "1", 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const platformRows = db
        .select({ slug: platforms.slug, name: platforms.name })
        .from(platforms)
        .orderBy(asc(platforms.name))
        .all();
    const result = queryGames(db, {
        q,
        platform,
        sort,
        page,
        pageSize: PAGE_SIZE,
    });
    const hasFilters = Boolean(q ?? platform);
    const baseQuery = {
        ...(q ? { q } : {}),
        ...(platform ? { platform } : {}),
        ...(sort !== "title" ? { sort } : {}),
    };
    return (
        <main className="mx-auto w-full max-w-6xl px-6 py-12">
            <header className="mb-8">
                <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
                <p className="mt-2 text-sm text-muted">
                    {result.total === 0
                        ? "No games yet."
                        : `${result.total} game${result.total === 1 ? "" : "s"}`}
                </p>
            </header>
            <form
                method="get"
                className="mb-8 flex flex-wrap items-end gap-3 rounded-lg border border-line p-4"
            >
                <div className="flex min-w-56 flex-1 flex-col gap-1.5">
                    <label htmlFor="q" className="text-xs text-muted">
                        Search
                    </label>
                    <input
                        id="q"
                        name="q"
                        type="search"
                        defaultValue={q ?? ""}
                        placeholder="Title…"
                        className="rounded border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="platform" className="text-xs text-muted">
                        Platform
                    </label>
                    <select
                        id="platform"
                        name="platform"
                        defaultValue={platform ?? ""}
                        className="min-w-48 rounded border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        <option value="">All platforms</option>
                        {platformRows.map((row) => (
                            <option key={row.slug} value={row.slug}>
                                {row.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="sort" className="text-xs text-muted">
                        Sort
                    </label>
                    <select
                        id="sort"
                        name="sort"
                        defaultValue={sort}
                        className="min-w-40 rounded border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        {GAME_SORTS.map((value) => (
                            <option key={value} value={value}>
                                {SORT_LABELS[value]}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="submit"
                    className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    Apply
                </button>
                {hasFilters ? (
                    <Link
                        href="/library"
                        className="px-2 py-2 text-sm text-muted underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        Clear
                    </Link>
                ) : null}
            </form>
            {result.games.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-12 text-center">
                    {hasFilters ? (
                        <>
                            <p className="text-sm">No games match these filters.</p>
                            <Link
                                href="/library"
                                className="mt-2 inline-block text-sm text-accent underline-offset-4 hover:underline"
                            >
                                Clear filters
                            </Link>
                        </>
                    ) : (
                        <>
                            <p className="text-sm">Your library is empty.</p>
                            <p className="mt-2 text-sm text-muted">
                                Add ROM files under your library&rsquo;s platform folders, then
                                run a scan.
                            </p>
                            <Link
                                href="/settings"
                                className="mt-4 inline-block text-sm text-accent underline-offset-4 hover:underline"
                            >
                                Go to Settings
                            </Link>
                        </>
                    )}
                </div>
            ) : (
                <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                    {result.games.map((game) => (
                        <li key={game.slug}>
                            <Link
                                href={`/games/${game.slug}`}
                                className="group block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                                <PlaceholderCover
                                    title={game.title}
                                    platformSlug={game.platformSlug}
                                />
                                <h2 className="mt-2 line-clamp-2 text-sm font-medium leading-snug group-hover:underline">
                                    {game.title}
                                </h2>
                            </Link>
                            <p className="mt-0.5 text-xs text-muted">
                                {game.platformName}
                                {game.releaseYear ? ` · ${game.releaseYear}` : ""}
                            </p>
                            {!game.present ? (
                                <p className="mt-1 text-xs text-warning">File missing</p>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
            {result.pageCount > 1 ? (
                <nav
                    aria-label="Pagination"
                    className="mt-10 flex items-center justify-center gap-4 text-sm"
                >
                    {page > 1 ? (
                        <Link
                            href={{ pathname: "/library", query: { ...baseQuery, page: page - 1 } }}
                            className="text-accent underline-offset-4 hover:underline"
                        >
                            Previous
                        </Link>
                    ) : (
                        <span className="text-muted">Previous</span>
                    )}
                    <span className="text-muted">
                        Page {result.page} of {result.pageCount}
                    </span>
                    {page < result.pageCount ? (
                        <Link
                            href={{ pathname: "/library", query: { ...baseQuery, page: page + 1 } }}
                            className="text-accent underline-offset-4 hover:underline"
                        >
                            Next
                        </Link>
                    ) : (
                        <span className="text-muted">Next</span>
                    )}
                </nav>
            ) : null}
        </main>
    );
}