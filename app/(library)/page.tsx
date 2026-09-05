import Link from "next/link";
import { GameCard } from "@/components/library/game-card";
import { db } from "@/db/client";
import { formatPlaytime, formatRelative } from "@/lib/format";
import { continuePlaying, favouriteGames, platformSummaries, queryGames, randomPick, recentlyAdded, type GameListItem } from "@/lib/games/query";

export const dynamic = "force-dynamic";

const ROW_SIZE = 6;

function Section({
    title,
    href,
    children,
}: {
    title: string;
    href?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="mb-12">
            <div className="mb-4 flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-medium tracking-tight">{title}</h2>
                {href ? (
                    <Link
                        href={href}
                        className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        View all
                    </Link>
                ) : null}
            </div>
            {children}
        </section>
    );
}

function Grid({ children }: { children: React.ReactNode }) {
    return (
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
            {children}
        </ul>
    );
}

function card(game: GameListItem, meta?: string) {
    return (
        <GameCard
            key={game.slug}
            slug={game.slug}
            title={game.title}
            platformSlug={game.platformSlug}
            platformName={game.platformName}
            releaseYear={game.releaseYear}
            present={game.present}
            meta={meta}
        />
    );
}

export default async function HomePage() {
    const total = queryGames(db, { pageSize: 1 }).total;
    if (total === 0) {
        return (
            <main className="mx-auto w-full max-w-6xl px-6 py-12">
                <h1 className="text-3xl font-semibold tracking-tight">Your library</h1>
                <div className="mt-8 rounded-lg border border-dashed border-line p-12 text-center">
                    <p className="text-sm">No games yet.</p>
                    <p className="mt-2 text-sm text-muted">
                        Add ROM files under your library&rsquo;s platform folders, then run
                        a scan.
                    </p>
                    <Link
                        href="/settings"
                        className="mt-4 inline-block text-sm text-accent underline-offset-4 hover:underline"
                    >
                        Go to Settings
                    </Link>
                </div>
            </main>
        );
    }

    const resume = continuePlaying(db, ROW_SIZE);
    const recent = recentlyAdded(db, ROW_SIZE);
    const favourites = favouriteGames(db, ROW_SIZE);
    const pick = randomPick(db);
    const platforms = platformSummaries(db).filter((row) => row.gameCount > 0);
    return (
        <main className="mx-auto w-full max-w-6xl px-6 py-12">
            <header className="mb-10">
                <h1 className="text-3xl font-semibold tracking-tight">Your library</h1>
                <p className="mt-2 text-sm text-muted">
                    {total} game{total === 1 ? "" : "s"} across {platforms.length} system
                    {platforms.length === 1 ? "" : "s"}.
                </p>
            </header>
            {resume.length > 0 ? (
                <Section title="Continue playing" href="/library?sort=last-played">
                    <Grid>
                        {resume.map((game) =>
                            card(
                                game,
                                [
                                    formatPlaytime(game.totalPlaySeconds),
                                    game.lastPlayedAt ? formatRelative(game.lastPlayedAt) : null,
                                ]
                                    .filter(Boolean)
                                    .join(" · "),
                            ),
                        )}
                    </Grid>
                </Section>
            ) : null}
            {favourites.length > 0 ? (
                <Section title="Favourites" href="/library">
                    <Grid>{favourites.map((game) => card(game))}</Grid>
                </Section>
            ) : null}
            <Section title="Recently added" href="/library?sort=recently-added">
                <Grid>{recent.map((game) => card(game))}</Grid>
            </Section>
            {pick ? (
                <Section title="Random pick">
                    <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
                        {card(pick)}
                    </ul>
                </Section>
            ) : null}
            {platforms.length > 0 ? (
                <Section title="Systems" href="/platforms">
                    <ul className="flex flex-wrap gap-2">
                        {platforms.map((platform) => (
                            <li key={platform.slug}>
                                <Link
                                    href={`/library?platform=${platform.slug}`}
                                    className="inline-block rounded-full border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                                >
                                    {platform.name}
                                    <span className="ml-2 text-xs text-muted">
                                        {platform.gameCount}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </Section>
            ) : null}
        </main>
    );
}