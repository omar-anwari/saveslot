import Link from "next/link";
import { PlaceholderCover } from "@/components/library/placeholder-cover";

export interface GameCardProps {
    slug: string;
    title: string;
    platformSlug: string;
    platformName: string;
    releaseYear?: number | null;
    present?: boolean;
    meta?: string;
}

export function GameCard({
    slug,
    title,
    platformSlug,
    platformName,
    releaseYear,
    present = true,
    meta,
}: GameCardProps) {
    return (
        <li>
            <Link
                href={`/games/${slug}`}
                className="group block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                <PlaceholderCover title={title} platformSlug={platformSlug} />
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