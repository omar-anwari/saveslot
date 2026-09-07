import Link from "next/link";
import { CoverImage } from "@/components/library/cover-image";
import { artworkUrl } from "@/lib/artwork/url";

export interface GameCardProps {
    slug: string;
    title: string;
    platformSlug: string;
    platformName: string;
    releaseYear?: number | null;
    present?: boolean;
    meta?: string;
    coverThumbPath?: string | null;
}

export function GameCard({
    slug,
    title,
    platformSlug,
    platformName,
    releaseYear,
    present = true,
    meta,
    coverThumbPath = null,
}: GameCardProps) {
    return (
        <li>
            <Link
                href={`/games/${slug}`}
                className="group block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                <CoverImage
                    title={title}
                    platformSlug={platformSlug}
                    src={artworkUrl(coverThumbPath)}
                />
                <h3 className="mt-2 line-clamp-2 text-sm font-medium leading-snug group-hover:underline">
                    {title}
                </h3>
            </Link>
            <p className="mt-0.5 text-xs text-muted">
                {platformName}
                {releaseYear ? ` · ${releaseYear}` : ""}
            </p>
            {meta ? <p className="mt-0.5 text-xs text-muted">{meta}</p> : null}
            {!present ? (
                <p className="mt-1 text-xs text-warning">File missing</p>
            ) : null}
        </li>
    );
}