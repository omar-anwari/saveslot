import Image from "next/image";

const LOGO_FILES: Record<string, string> = {
    atari2600: "Atari2600.svg",
    atari5200: "Atari5200.svg",
    atari7800: "Atari7800.svg",
    colecovision: "ColecoVision.svg",
    gamegear: "GameGear.svg",
    gb: "GB.svg",
    gba: "GBA.svg",
    gbc: "GBC.svg",
    genesis: "Genesis.svg",
    jaguar: "Jaguar.svg",
    lynx: "Lynx.svg",
    mastersystem: "MasterSystem.svg",
    n64: "n64.svg",
    nds: "NDS.svg",
    nes: "NES.svg",
    ngp: "NGP.svg",
    pcengine: "PCEngine.svg",
    psp: "PSP.svg",
    psx: "PSX.svg",
    saturn: "Saturn.svg",
    sega32x: "Sega32x.svg",
    segacd: "SegaCD.svg",
    snes: "SNES.svg",
    virtualboy: "Virtualboy.svg",
    wonderswan: "WonderSwan.svg",
};

export function SystemLogo({ slug, className }: { slug: string; className?: string }) {
    const file = LOGO_FILES[slug];
    if (file === undefined) {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 320 180"
                width="320"
                height="180"
                fill="none"
                stroke="#f5f3ee"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={className}
            >
                <path d="M116 54h88c17 0 28 12 32 30l9 37c5 23-18 33-33 16l-19-21h-66l-19 21c-15 17-38 7-33-16l9-37c4-18 15-30 32-30Z" />
                <path d="M113 75v28m-14-14h28" />
                <circle cx="204" cy="79" r="5" fill="#f5f3ee" stroke="none" />
                <circle cx="218" cy="96" r="5" fill="#f5f3ee" stroke="none" />
                <path d="M151 102h18" strokeWidth="4" />
            </svg>
        );
    }
    return (
        <Image
            src={`/systems/${file}`}
            alt=""
            aria-hidden="true"
            width={320}
            height={180}
            className={className}
            unoptimized
        />
    );
}
