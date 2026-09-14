import Link from "next/link";
import { CoverImage } from "@/components/library/cover-image";
import { FavoriteButton } from "@/components/library/favorite-button";
import { BrowseIcon } from "@/components/library/browse-icon";
import { platformLabel } from "@/components/library/game-card";
import { artworkUrl } from "@/lib/artwork/url";
import type { GameListItem } from "@/lib/games/query";

export function GameList({ games, compact = false }: { games: GameListItem[]; compact?: boolean }) {
    return <ul className={compact ? "grid gap-2 xl:grid-cols-2" : "overflow-hidden rounded-lg border border-line bg-elevated divide-y divide-line"}>
        {games.map((game) => <li key={game.slug} className={`group flex min-w-0 items-center gap-2 pr-3 transition-colors hover:bg-surface-hover ${compact ? "rounded-sm border border-line bg-elevated" : ""}`}>
            <Link href={`/games/${game.slug}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-sm p-3 sm:gap-4">
                <span className="w-10 shrink-0 overflow-hidden rounded-[6px]"><CoverImage title={game.title} platformSlug={game.platformSlug} src={artworkUrl(game.coverThumbPath)} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{game.title}</span><span className="mt-1 block truncate text-xs text-subtle">{game.platformName}{!game.present ? " · File missing" : ""}</span></span>
                {!compact ? <span className="hidden rounded border border-line px-2 py-1 text-[10px] font-medium tracking-wide text-muted md:block">{platformLabel(game.platformSlug)}</span> : null}
                <span className="w-9 shrink-0 text-right text-xs text-subtle tabular-nums">{game.releaseYear ?? "—"}</span>
            </Link>
            <FavoriteButton slug={game.slug} title={game.title} favourite={game.favourite} />
            {!compact ? <span className="hidden pr-1 text-subtle sm:block"><BrowseIcon name="chevron" width="14" height="14" /></span> : null}
        </li>)}
    </ul>;
}
