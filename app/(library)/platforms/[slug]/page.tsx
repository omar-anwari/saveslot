import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { ContinueCard } from "@/components/home/continue-card";
import { CoverImage } from "@/components/library/cover-image";
import { GameCard } from "@/components/library/game-card";
import { artworkUrl } from "@/lib/artwork/url";
import { queryGames, type GameListItem } from "@/lib/games/query";
import { availablePlatforms } from "@/lib/platforms/available";
import { systemTint, systemLogoBackdrop } from "@/lib/platforms/tint";
import { SystemLogo } from "@/components/library/system-logo";

export const dynamic = "force-dynamic";

const MAX_GAMES = 1000;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const platform = availablePlatforms(db).find((entry) => entry.slug === slug);
    return { title: platform?.name ?? "System not found" };
}

function letterOf(game: GameListItem): string {
    const first = game.sortTitle.trim().charAt(0).toUpperCase();
    return first >= "A" && first <= "Z" ? first : "#";
}

export default async function SystemPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const platform = availablePlatforms(db).find((entry) => entry.slug === slug);
    if (platform === undefined) notFound();
    const all = queryGames(db, { platform: slug, sort: "title", pageSize: MAX_GAMES }).games;
    const resuming = queryGames(db, { platform: slug, sort: "last-played", pageSize: 8 }).games.filter(
        (game) => game.totalPlaySeconds > 0,
    );
    const featured = [...all]
        .filter((game) => game.coverThumbPath !== null)
        .sort((left, right) => right.totalPlaySeconds - left.totalPlaySeconds)
        .slice(0, 6);
    const letters = new Map<string, GameListItem[]>();
    for (const game of all) {
        const letter = letterOf(game);
        const bucket = letters.get(letter);
        if (bucket === undefined) letters.set(letter, [game]);
        else bucket.push(game);
    }
    const present = [...letters.keys()].sort((left, right) =>
        left === "#" ? -1 : right === "#" ? 1 : left.localeCompare(right),
    );
    const random = queryGames(db, {
        platform: slug,
        present: true,
        sort: "random",
        pageSize: 1,
    }).games[0];
    const tint = systemTint(platform.slug);
    return (
        <div>
            <section
                className="border-b border-line px-8 py-10"
                style={{ background: `linear-gradient(135deg, ${tint.from}, ${tint.to} 70%)` }}
            >
                <Link href="/platforms" className="text-sm text-ink/70 hover:text-ink">
                    ← All systems
                </Link>
                <div
                    className="mt-5 flex h-24 w-40 items-center justify-center rounded-md p-4"
                    style={{ background: systemLogoBackdrop(platform.slug) }}
                >
                    <SystemLogo slug={platform.slug} className="h-full w-full object-contain" />
                </div>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight">{platform.name}</h1>
                <p className="mt-2 text-sm text-ink/75">
                    {platform.gameCount} game{platform.gameCount === 1 ? "" : "s"}
                    {platform.manufacturer === null ? "" : ` · ${platform.manufacturer}`}
                    {platform.generation === null ? "" : ` · ${platform.generation}th generation`}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                    {random === undefined ? null : (
                        <Link
                            href={`/player/${random.slug}`}
                            className="rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
                        >
                            ▶ Play something
                        </Link>
                    )}
                    <Link
                        href={`/library?platform=${platform.slug}`}
                        className="rounded-sm border border-line-strong px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface-hover"
                    >
                        Browse in library
                    </Link>
                </div>
                <details className="mt-6 max-w-xl text-sm text-ink/75">
                    <summary className="cursor-pointer">Technical details</summary>
                    <dl className="mt-3 space-y-1.5 text-xs">
                        <div className="flex gap-3">
                            <dt className="w-24 shrink-0 text-ink/60">Core</dt>
                            <dd className="font-mono">{platform.emulatorCore ?? "—"}</dd>
                        </div>
                        <div className="flex gap-3">
                            <dt className="w-24 shrink-0 text-ink/60">Extensions</dt>
                            <dd className="font-mono">{platform.extensionsJson.join(" ")}</dd>
                        </div>
                        <div className="flex gap-3">
                            <dt className="w-24 shrink-0 text-ink/60">Folders</dt>
                            <dd className="font-mono">{platform.folderAliasesJson.join(" ")}</dd>
                        </div>
                    </dl>
                </details>
            </section>
            <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                {resuming.length === 0 ? null : (
                    <section className="mb-10">
                        <h2 className="mb-4 text-xl font-medium tracking-tight">Continue playing</h2>
                        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                            {resuming.slice(0, 4).map((game) => (
                                <ContinueCard key={game.slug} game={game} />
                            ))}
                        </ul>
                    </section>
                )}
                {featured.length === 0 ? null : (
                    <section className="mb-10">
                        <h2 className="mb-4 text-xl font-medium tracking-tight">Most played here</h2>
                        <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 xl:grid-cols-6">
                            {featured.map((game) => (
                                <GameCard
                                    key={game.slug}
                                    slug={game.slug}
                                    title={game.title}
                                    platformSlug={game.platformSlug}
                                    platformName={game.platformName}
                                    releaseYear={game.releaseYear}
                                    present={game.present}
                                    coverThumbPath={game.coverThumbPath}
                                />
                            ))}
                        </ul>
                    </section>
                )}
                <section>
                    <div className="flex flex-wrap items-baseline justify-between gap-4">
                        <h2 className="text-xl font-medium tracking-tight">All games</h2>
                        <nav aria-label="Jump to letter" className="flex flex-wrap gap-1.5 text-xs">
                            {present.map((letter) => (
                                <a
                                    key={letter}
                                    href={`#letter-${letter}`}
                                    className="rounded px-1.5 py-0.5 text-muted hover:bg-surface-hover hover:text-ink"
                                >
                                    {letter}
                                </a>
                            ))}
                        </nav>
                    </div>
                    {present.map((letter) => (
                        <div key={letter} id={`letter-${letter}`} className="mt-6 scroll-mt-24">
                            <h3 className="mb-2 text-sm font-medium text-subtle">{letter}</h3>
                            <ul className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
                                {letters.get(letter)?.map((game) => (
                                    <li key={game.slug} className="bg-bg">
                                        <Link
                                            href={`/games/${game.slug}`}
                                            className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hover"
                                        >
                                            <span className="w-8 shrink-0">
                                                <CoverImage
                                                    title={game.title}
                                                    platformSlug={game.platformSlug}
                                                    src={artworkUrl(game.coverThumbPath)}
                                                />
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-sm">{game.title}</span>
                                            <span className="shrink-0 text-xs text-subtle tabular-nums">
                                                {game.releaseYear ?? ""}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </section>
            </div>
        </div>
    );
}