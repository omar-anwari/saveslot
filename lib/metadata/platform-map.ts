import { PLATFORM_BY_SLUG } from "../platforms/registry.ts";

const SLUG_BY_IGDB_PLATFORM_ID: ReadonlyMap<number, string> = new Map([
    [18, "nes"],
    [19, "snes"],
    [33, "gb"],
    [22, "gbc"],
    [24, "gba"],
    [64, "mastersystem"],
    [29, "genesis"],
    [35, "gamegear"],
    [4, "n64"],
]);

const SLUG_BY_NORMALIZED_NAME: ReadonlyMap<string, string> = new Map([
    ["nintendoentertainmentsystem", "nes"],
    ["supernintendoentertainmentsystem", "snes"],
    ["nintendogameboy", "gb"],
    ["nintendogameboycolor", "gbc"],
    ["nintendogameboyadvance", "gba"],
    ["nintendo64", "n64"],
    ["segamastersystem", "mastersystem"],
    ["segamegadrivegenesis", "genesis"],
    ["segagamegear", "gamegear"],
]);

function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function resolvePlatformSlug(
    igdbPlatformId: number | null,
    platformName: string | null,
): string | null {
    if (igdbPlatformId !== null) {
        const bySlug = SLUG_BY_IGDB_PLATFORM_ID.get(igdbPlatformId);
        if (bySlug !== undefined) return bySlug;
    }
    if (platformName !== null) {
        const byName = SLUG_BY_NORMALIZED_NAME.get(normalizeName(platformName));
        if (byName !== undefined) return byName;
    }
    return null;
}

export function igdbPlatformIdFor(slug: string): number | null {
    for (const [id, mapped] of SLUG_BY_IGDB_PLATFORM_ID) {
        if (mapped === slug) return id;
    }
    return null;
}

export function mappedPlatformSlugs(): readonly string[] {
    return [
        ...new Set([
            ...SLUG_BY_IGDB_PLATFORM_ID.values(),
            ...SLUG_BY_NORMALIZED_NAME.values(),
        ]),
    ].sort();
}

export function unknownMappedSlugs(): readonly string[] {
    return mappedPlatformSlugs().filter((slug) => !PLATFORM_BY_SLUG.has(slug));
}