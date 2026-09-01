function hueFromSlug(slug: string): number {
    let hash = 0;
    for (let index = 0; index < slug.length; index += 1) {
        hash = (hash * 31 + slug.charCodeAt(index)) % 360;
    }
    return hash;
}

export function PlaceholderCover({
    title,
    platformSlug,
}: {
    title: string;
    platformSlug: string;
}) {
    const hue = hueFromSlug(platformSlug);

    return (
        <div
            style={{ backgroundColor: `oklch(0.45 0.07 ${hue})` }}
            className="flex aspect-3/4 w-full items-end rounded-md p-3"
            aria-hidden="true"
        >
            <span className="line-clamp-4 text-sm font-medium leading-snug text-white/90">
                {title}
            </span>
        </div>
    );
}