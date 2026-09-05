import { describe, expect, it } from "vitest";
import { PLATFORM_REGISTRY } from "../platforms/registry.ts";
import {
    mappedPlatformSlugs,
    resolvePlatformSlug,
    unknownMappedSlugs,
} from "./platform-map.ts";

describe("resolvePlatformSlug", () => {
    it("maps the IGDB ids observed in live responses", () => {
        expect(resolvePlatformSlug(18, "Nintendo Entertainment System")).toBe("nes");
        expect(resolvePlatformSlug(33, "Nintendo Game Boy")).toBe("gb");
        expect(resolvePlatformSlug(29, "Sega Mega Drive / Genesis")).toBe("genesis");
    });
    it("falls back to the name when there is no IGDB mapping", () => {
        expect(resolvePlatformSlug(null, "Sega Game Gear")).toBe("gamegear");
        expect(resolvePlatformSlug(null, "sega  MASTER-system")).toBe("mastersystem");
    });
    it("prefers the id over a name that disagrees", () => {
        expect(resolvePlatformSlug(33, "Sega Game Gear")).toBe("gb");
    });
    it("returns null rather than guessing", () => {
        expect(resolvePlatformSlug(7, "Sony PlayStation")).toBeNull();
        expect(resolvePlatformSlug(null, "Bandai WonderSwan")).toBeNull();
        expect(resolvePlatformSlug(null, null)).toBeNull();
    });
    it("only ever names platforms we support", () => {
        expect(unknownMappedSlugs()).toEqual([]);
    });
    it("covers every enabled platform in the registry", () => {
        const mapped = new Set(mappedPlatformSlugs());
        const missing = PLATFORM_REGISTRY.filter(
            (platform) => platform.enabled && !mapped.has(platform.slug),
        ).map((platform) => platform.slug);
        expect(missing).toEqual([]);
    });
});