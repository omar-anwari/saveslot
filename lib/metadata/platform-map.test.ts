import { describe, expect, it } from "vitest";
import { PLATFORM_REGISTRY } from "../platforms/registry.ts";
import {
    igdbPlatformIdsFor,
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
        expect(resolvePlatformSlug(48, "PlayStation 4")).toBeNull();
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
    it("folds a colour variant into the same platform", () => {
        expect(resolvePlatformSlug(119, "Neo Geo Pocket")).toBe("ngp");
        expect(resolvePlatformSlug(120, "Neo Geo Pocket Color")).toBe("ngp");
        expect(resolvePlatformSlug(57, "WonderSwan")).toBe("wonderswan");
        expect(resolvePlatformSlug(123, "WonderSwan Color")).toBe("wonderswan");
    });
    it("returns every id a search should filter on", () => {
        expect(igdbPlatformIdsFor("ngp")).toEqual([119, 120]);
        expect(igdbPlatformIdsFor("wonderswan")).toEqual([57, 123]);
        expect(igdbPlatformIdsFor("nes")).toEqual([18]);
        expect(igdbPlatformIdsFor("nope")).toEqual([]);
    });
    it("treats the Japanese variant as the same platform", () => {
        expect(resolvePlatformSlug(58, "Super Famicom")).toBe("snes");
        expect(igdbPlatformIdsFor("snes")).toEqual([19, 58]);
    });
});