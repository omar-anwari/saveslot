import { z } from "zod"; const PlatformDefinitionSchema = z.object({
    slug: z.string().regex(/^[a-z0-9]+$/),
    name: z.string().min(1),
    manufacturer: z.string().min(1),
    generation: z.number().int().positive(),
    emulatorCore: z.string().min(1),
    extensions: z.array(z.string().regex(/^\.[a-z0-9]+$/)).min(1),
    folderAliases: z.array(z.string().regex(/^[a-z0-9]+$/)).min(1),
    requiresBios: z.boolean(),
    experimental: z.boolean(),
    enabled: z.boolean(),
});

export type PlatformDefinition = z.infer<typeof PlatformDefinitionSchema>;

const definitions: PlatformDefinition[] = [
    {
        slug: "nes",
        name: "Nintendo Entertainment System",
        manufacturer: "Nintendo",
        generation: 3,
        emulatorCore: "fceumm",
        extensions: [".nes", ".zip"],
        folderAliases: ["nes", "famicom", "fc"],
        requiresBios: false,
        experimental: false,
        enabled: true,
    },
    {
        slug: "snes",
        name: "Super Nintendo Entertainment System",
        manufacturer: "Nintendo",
        generation: 4,
        emulatorCore: "snes9x",
        extensions: [".sfc", ".smc", ".zip"],
        folderAliases: ["snes", "sfc", "superfamicom"],
        requiresBios: false,
        experimental: false,
        enabled: true,
    },
    {
        slug: "gb",
        name: "Game Boy",
        manufacturer: "Nintendo",
        generation: 4,
        emulatorCore: "gambatte",
        extensions: [".gb", ".zip"],
        folderAliases: ["gb", "gameboy"],
        requiresBios: false,
        experimental: false,
        enabled: true,
    },
    {
        slug: "gbc",
        name: "Game Boy Color",
        manufacturer: "Nintendo",
        generation: 5,
        emulatorCore: "gambatte",
        extensions: [".gbc", ".zip"],
        folderAliases: ["gbc", "gameboycolor"],
        requiresBios: false,
        experimental: false,
        enabled: true,
    },
    {
        slug: "gba",
        name: "Game Boy Advance",
        manufacturer: "Nintendo",
        generation: 6,
        emulatorCore: "mgba",
        extensions: [".gba", ".zip"],
        folderAliases: ["gba", "gameboyadvance"],
        requiresBios: false,
        experimental: false,
        enabled: true,
    },
    {
        slug: "mastersystem",
        name: "Sega Master System",
        manufacturer: "Sega",
        generation: 3,
        emulatorCore: "smsplus",
        extensions: [".sms", ".zip"],
        folderAliases: ["mastersystem", "sms"],
        requiresBios: false,
        experimental: false,
        enabled: true,
    },
    {
        slug: "genesis",
        name: "Sega Genesis / Mega Drive",
        manufacturer: "Sega",
        generation: 4,
        emulatorCore: "genesis_plus_gx",
        extensions: [".md", ".gen", ".bin", ".zip"],
        folderAliases: ["genesis", "megadrive", "md"],
        requiresBios: false,
        experimental: false,
        enabled: true,
    },
    {
        slug: "gamegear",
        name: "Sega Game Gear",
        manufacturer: "Sega",
        generation: 4,
        emulatorCore: "genesis_plus_gx",
        extensions: [".gg", ".zip"],
        folderAliases: ["gamegear", "gg"],
        requiresBios: false,
        experimental: false,
        enabled: true,
    },
    {
        slug: "n64",
        name: "Nintendo 64",
        manufacturer: "Nintendo",
        generation: 5,
        emulatorCore: "mupen64plus_next",
        extensions: [".z64", ".n64", ".v64", ".zip"],
        folderAliases: ["n64", "nintendo64"],
        requiresBios: false,
        experimental: true,
        enabled: true,
    },
];

export const PLATFORM_REGISTRY: readonly PlatformDefinition[] = Object.freeze(
    z.array(PlatformDefinitionSchema).min(1).parse(definitions),
);

function buildAliasIndex(): ReadonlyMap<string, PlatformDefinition> {
    const index = new Map<string, PlatformDefinition>();
    for (const platform of PLATFORM_REGISTRY) {
        for (const alias of platform.folderAliases) {
            const existing = index.get(alias);
            if (existing) {
                throw new Error(
                    `Platform registry error: folder alias "${alias}" is claimed by both ` +
                    `"${existing.slug}" and "${platform.slug}"`,
                );
            }
            index.set(alias, platform);
        }
    }
    return index;
}

export const PLATFORM_BY_FOLDER_ALIAS = buildAliasIndex();
export const PLATFORM_BY_SLUG: ReadonlyMap<string, PlatformDefinition> = new Map(
  PLATFORM_REGISTRY.map((platform) => [platform.slug, platform]),
);

export function platformForFolderName(
  folderName: string,
): PlatformDefinition | undefined {
  return PLATFORM_BY_FOLDER_ALIAS.get(folderName.trim().toLowerCase());
}