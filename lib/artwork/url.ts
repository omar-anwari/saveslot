export function artworkUrl(relativePath: string | null | undefined): string | null {
    if (typeof relativePath !== "string") return null;
    const match = /^artwork\/([a-z0-9]+)\/[0-9a-f]{2}\/([0-9a-f]{64})\.webp$/.exec(relativePath);
    if (match === null) return null;
    return `/api/artwork/${match[1]}/${match[2]}.webp`;
}