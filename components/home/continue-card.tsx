import Link from "next/link";
import { hueFromSlug } from "@/components/library/placeholder-cover";
import { PlayIcon, ClockIcon, MoreIcon } from "@/components/shell/icons";
import { artworkUrl } from "@/lib/artwork/url";
import { formatPlaytime, formatRelative } from "@/lib/format";
import type { GameListItem } from "@/lib/games/query";

export function ContinueCard({ game, screenshotUrl = null }: { game: GameListItem; screenshotUrl?: string | null }) {
    const cover = screenshotUrl ?? artworkUrl(game.coverPath) ?? artworkUrl(game.coverThumbPath);
    return (
        <li className="group relative min-w-0 rounded-md border border-line bg-surface transition-colors hover:border-line-strong hover:bg-surface-hover">
            <Link href={game.present ? `/player/${game.slug}` : `/games/${game.slug}`} aria-label={`Continue ${game.title}`} className="block overflow-hidden rounded-t-md">
                <div className="relative aspect-video overflow-hidden" style={{ background: `linear-gradient(135deg, oklch(0.3 0.05 ${hueFromSlug(game.platformSlug)}), #121722)` }}>
                    {cover ? <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover object-[center_30%] transition-transform duration-300 group-hover:scale-[1.025]" />
                    </> : <div className="flex h-full items-center justify-center text-ink/20"><PlayIcon /></div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-bg/80 via-transparent to-transparent" />
                    <span className="absolute left-3 top-3 rounded bg-bg/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-ink backdrop-blur">{game.platformSlug}</span>
                    <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors group-hover:bg-accent"><PlayIcon /></span>
                </div>
            </Link>
            <div className="relative px-3.5 pb-3.5 pt-3">
                <Link href={`/games/${game.slug}`} className="block truncate pr-7 text-sm font-medium hover:text-[#b4a4ff]">{game.title}</Link>
                <Link href={`/games/${game.slug}`} aria-label={`More about ${game.title}`} className="absolute right-0 top-1.5 flex h-11 w-11 items-center justify-center text-muted hover:text-ink"><MoreIcon /></Link>
                <p className="mt-1 truncate text-[11px] text-muted">{game.platformName}</p>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[10px] text-muted">
                    <span className="flex items-center gap-1.5"><ClockIcon />{formatPlaytime(game.totalPlaySeconds)}</span>
                    {game.present ? <span>{game.lastPlayedAt ? formatRelative(game.lastPlayedAt) : "Not played yet"}</span> : <span className="text-warning">File missing</span>}
                </div>
            </div>
        </li>
    );
}
