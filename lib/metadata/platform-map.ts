import { PLATFORM_BY_SLUG } from "../platforms/registry.ts";

const SLUG_BY_IGDB_PLATFORM_ID: ReadonlyMap<number, string> = new Map([
    [18, "nes"],
    [19, "snes"],
    [58, "snes"],
    [33, "gb"],
    [22, "gbc"],
    [24, "gba"],
    [64, "mastersystem"],
    [29, "genesis"],
    [35, "gamegear"],
    [4, "n64"],
    [59, "atari2600"],
    [60, "atari7800"],
    [87, "virtualboy"],
    [119, "ngp"],
    [120, "ngp"],
    [57, "wonderswan"],
    [123, "wonderswan"],
    [86, "pcengine"],
    [128, "pcengine"],
    [30, "sega32x"],
    [62, "jaguar"],
    [66, "atari5200"],
    [61, "lynx"],
    [68, "colecovision"],
    [20, "nds"],
    [7, "psx"],
    [78, "segacd"],
    [32, "saturn"],
    [38, "psp"],
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

export function igdbPlatformIdsFor(slug: string): number[] {
    const ids: number[] = [];
    for (const [id, mapped] of SLUG_BY_IGDB_PLATFORM_ID) {
        if (mapped === slug) ids.push(id);
    }
    return ids.sort((left, right) => left - right);
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