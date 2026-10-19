import Link from "next/link";
import { artworkUrl } from "@/lib/artwork/url";
import { formatPlaytime, formatRelative } from "@/lib/format";
import { PlayIcon, ClockIcon } from "@/components/shell/icons";
import type { GameListItem } from "@/lib/games/query";

export function ResumeHero({ game, hasSave = false, screenshotUrl = null }: {
    game: GameListItem;
    hasSave?: boolean;
    screenshotUrl?: string | null;
}) {
    const cover = artworkUrl(game.coverPath) ?? artworkUrl(game.coverThumbPath);
    const artwork = screenshotUrl ?? cover;
    return (
        <section aria-label="Featured game" className="relative isolate overflow-hidden rounded-xl border border-line bg-elevated shadow-card">
            {artwork ? <div className="hero-artwork absolute inset-y-0 right-0 w-full sm:w-3/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artwork} alt="" aria-hidden="true" className="h-full w-full object-cover object-[center_35%] opacity-60 sm:opacity-80" fetchPriority="high" />
            </div> : null}
            <div className="absolute inset-0 bg-gradient-to-r from-[#131320] via-[#11131e]/90 to-bg/10" />
            <div className="absolute inset-0 bg-gradient-to-t from-bg/65 to-transparent" />
            <div className="relative flex min-h-[270px] items-center p-6 sm:px-8 sm:py-7 lg:px-10">
                <div className="max-w-xl">
                    <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b4a4ff]">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        {game.lastPlayedAt ? "Continue playing" : "From your library"}
                    </p>
                    <h2 className="max-w-[17ch] text-2xl font-semibold leading-[1.12] tracking-tight sm:text-3xl lg:text-4xl">{game.title}</h2>
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink">{game.platformSlug}</span>
                        {game.platformName}{game.releaseYear ? <><span className="text-subtle">•</span>{game.releaseYear}</> : null}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        {game.present ? <Link href={`/player/${game.slug}`} className="button-primary"><PlayIcon />{hasSave ? "Resume game" : "Play game"}</Link>
                            : <span className="button-secondary text-warning">File missing</span>}
                        <Link href={`/games/${game.slug}`} className="button-secondary">More info</Link>
                    </div>
                    <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <ClockIcon />{formatPlaytime(game.totalPlaySeconds)}{game.totalPlaySeconds > 0 ? " played" : ""}
                        {game.lastPlayedAt ? <><span className="px-1 text-subtle">•</span>Last played {formatRelative(game.lastPlayedAt)}</> : null}
                    </p>
                </div>
            </div>
        </section>
    );
}
