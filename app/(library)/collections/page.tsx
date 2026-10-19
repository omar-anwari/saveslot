import Link from "next/link";
import { db } from "@/db/client";
import { queryGames } from "@/lib/games/query";
import { SMART_COLLECTIONS } from "@/lib/collections";
import { CoverImage } from "@/components/library/cover-image";
import { artworkUrl } from "@/lib/artwork/url";
import { ArrowRightIcon, CollectionsIcon } from "@/components/shell/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Collections" };

export default function CollectionsPage() {
    return <div className="page-shell">
        <header className="page-header"><div><h1>Collections</h1><p className="mt-2 text-sm text-muted">Views built from play status and favorites.</p></div>
            <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted">{SMART_COLLECTIONS.length} smart collections</span>
        </header>
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {SMART_COLLECTIONS.map((collection) => {
                const result = queryGames(db, { ...collection.query, pageSize: 4 });
                return <li key={collection.slug}>
                    <Link href={collection.href} className="group block overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong hover:bg-surface-hover">
                        <div className="relative grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-1 overflow-hidden bg-elevated p-1">
                            {Array.from({ length: 4 }, (_, index) => {
                                const game = result.games[index];
                                return <div key={game?.slug ?? index} className="overflow-hidden rounded-[4px] bg-gradient-to-br from-surface-active to-elevated [&>div]:h-full [&>div]:rounded-none">
                                    {game ? <CoverImage title={game.title} platformSlug={game.platformSlug} src={artworkUrl(game.coverThumbPath)} /> : <span className="flex h-full items-center justify-center text-ink/15"><CollectionsIcon /></span>}
                                </div>;
                            })}
                            <span className="absolute left-4 top-4 rounded bg-bg/85 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-ink backdrop-blur">Smart collection</span>
                        </div>
                        <div className="p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{collection.name}</h2><span className="text-muted group-hover:text-ink"><ArrowRightIcon /></span></div>
                            <p className="mt-1.5 text-xs text-muted">{result.total.toLocaleString()} game{result.total === 1 ? "" : "s"}</p>
                            <p className="mt-3 text-xs leading-relaxed text-muted">{collection.description}</p>
                        </div>
                    </Link>
                </li>;
            })}
        </ul>
        <p className="mt-6 flex items-center gap-2 text-xs text-muted"><CollectionsIcon />Collections update as you favorite games and change their play status.</p>
    </div>;
}
