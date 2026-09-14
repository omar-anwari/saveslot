import { hueFromSlug } from "@/components/library/placeholder-cover";

const HERO: Record<string, { hue: number; chroma: number }> = {
    gb: { hue: 125, chroma: 0.045 },
    gbc: { hue: 155, chroma: 0.07 },
    gba: { hue: 285, chroma: 0.09 },
    snes: { hue: 300, chroma: 0.06 },
    nes: { hue: 25, chroma: 0.06 },
    n64: { hue: 260, chroma: 0.025 },
    nds: { hue: 215, chroma: 0.04 },
    psx: { hue: 240, chroma: 0.02 },
    psp: { hue: 250, chroma: 0.03 },
    genesis: { hue: 250, chroma: 0.04 },
    segacd: { hue: 250, chroma: 0.04 },
    sega32x: { hue: 25, chroma: 0.06 },
    saturn: { hue: 265, chroma: 0.03 },
    mastersystem: { hue: 220, chroma: 0.05 },
    gamegear: { hue: 200, chroma: 0.06 },
    pcengine: { hue: 25, chroma: 0.07 },
    virtualboy: { hue: 25, chroma: 0.1 },
    ngp: { hue: 200, chroma: 0.05 },
    wonderswan: { hue: 210, chroma: 0.06 },
    lynx: { hue: 60, chroma: 0.06 },
    jaguar: { hue: 85, chroma: 0.05 },
    atari2600: { hue: 25, chroma: 0.07 },
    atari5200: { hue: 255, chroma: 0.05 },
    atari7800: { hue: 25, chroma: 0.05 },
    colecovision: { hue: 250, chroma: 0.03 },
};

export function systemTint(slug: string): { from: string; to: string } {
    const tint = HERO[slug] ?? { hue: hueFromSlug(slug), chroma: 0.05 };
    return {
        from: `oklch(0.38 ${tint.chroma} ${tint.hue})`,
        to: `oklch(0.17 ${tint.chroma * 0.5} ${tint.hue})`,
    };
}

const LIGHT_LOGOS = new Set(["genesis", "segacd"]);

export function systemLogoBackdrop(slug: string): string {
    const tint = HERO[slug] ?? { hue: hueFromSlug(slug), chroma: 0.05 };
    return LIGHT_LOGOS.has(slug)
        ? `linear-gradient(140deg, oklch(0.26 ${tint.chroma * 0.6} ${tint.hue}), oklch(0.15 ${tint.chroma * 0.4} ${tint.hue}))`
        : `linear-gradient(140deg, oklch(0.95 ${Math.min(tint.chroma, 0.03)} ${tint.hue}), oklch(0.87 ${Math.min(tint.chroma, 0.04)} ${tint.hue}))`;
}