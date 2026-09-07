import { PlaceholderCover } from "@/components/library/placeholder-cover";

export function CoverImage({
    title,
    platformSlug,
    src,
}: {
    title: string;
    platformSlug: string;
    src: string | null;
}) {
    if (src === null) {
        return <PlaceholderCover title={title} platformSlug={platformSlug} />;
    }
    return (
        <div className="aspect-3/4 w-full overflow-hidden rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={`Cover art for ${title}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
            />
        </div>
    );
}