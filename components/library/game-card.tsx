import Link from "next/link";
import { CoverImage } from "@/components/library/cover-image";
import { BrowseIcon } from "@/components/library/browse-icon";
import { FavoriteButton } from "@/components/library/favorite-button";
import { artworkUrl } from "@/lib/artwork/url";

export interface GameCardProps {
    slug: string;
    title: string;
    platformSlug: string;
    platformName: string;
    releaseYear?: number | null;
    present?: boolean;
    favourite?: boolean;
    lastPlayedAt?: Date | null;
    hasSave?: boolean;
    meta?: string;
    coverThumbPath?: string | null;
}

export function platformLabel(slug: string): string {
    return ({ psx: "PS1", genesis: "GEN", mastersystem: "SMS", gamegear: "GG", nds: "DS" } as Record<string, string>)[slug] ?? slug.toUpperCase();
}

export function GameCard({ slug, title, platformSlug, platformName, releaseYear, present = true, favourite, lastPlayedAt, hasSave = false, meta, coverThumbPath = null }: GameCardProps) {
    return (
        <li className="group min-w-0">
            <Link href={`/games/${slug}`} className="block rounded-md">
                <div className="relative overflow-hidden rounded-md border border-line bg-surface shadow-card transition duration-200 group-hover:-translate-y-1 group-hover:border-line-strong [&_img]:transition-transform [&_img]:duration-300 group-hover:[&_img]:scale-[1.045]">
                    <CoverImage title={title} platformSlug={platformSlug} src={artworkUrl(coverThumbPath)} />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                    <span className="absolute bottom-2.5 left-2.5 rounded-[5px] border border-white/10 bg-black/55 px-2 py-1 text-[10px] font-semibold tracking-wider text-white/90 backdrop-blur-md" title={platformName}>{platformLabel(platformSlug)}</span>
                    {!present ? <span className="absolute top-2 right-2 rounded-[5px] bg-black/75 px-2 py-1 text-[10px] font-medium text-warning">File missing</span> : null}
                    <span className="absolute right-2.5 bottom-2.5 flex h-7 w-7 translate-x-1 items-center justify-center rounded-full bg-white/90 text-black opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:opacity-100"><BrowseIcon name="arrow" width="15" height="15" /></span>
                </div>
                <h3 className="mt-3 line-clamp-2 text-[13px] font-medium leading-snug text-ink transition-colors group-hover:text-white">{title}</h3>
            </Link>
            <div className="mt-1 flex min-h-8 items-center gap-0.5">
                <p className="min-w-0 flex-1 truncate text-xs text-subtle">{releaseYear ?? platformName}</p>
                {hasSave ? <Link href={`/games/${slug}?tab=saves`} aria-label={`View saves for ${title}`} title="Save available" className="flex h-8 w-7 items-center justify-center rounded-sm text-subtle hover:bg-surface-active hover:text-ink"><BrowseIcon name="save" width="14" height="14" /></Link> : null}
                {lastPlayedAt ? <span className="flex h-8 w-6 items-center justify-center text-subtle" title={`Last played ${lastPlayedAt.toLocaleDateString("en-US")}`}><BrowseIcon name="clock" width="14" height="14" /><span className="sr-only">Previously played</span></span> : null}
                {favourite === undefined ? null : <FavoriteButton slug={slug} title={title} favourite={favourite} />}
            </div>
            {meta ? <p className="mt-0.5 text-xs text-muted">{meta}</p> : null}
        </li>
    );
}
