import { describe, expect, it } from "vitest";
import { PLATFORM_REGISTRY } from "../platforms/registry.ts";
import {
    coreNames,
    findCore,
    isEmulatorJsInstalled,
    saveExtension,
} from "./manifest.ts";

const installed = isEmulatorJsInstalled();
describe.skipIf(!installed)("EmulatorJS core contract", () => {
    it("every platform's core exists in the pinned build", () => {
        const available = coreNames();
        const missing = PLATFORM_REGISTRY.filter(
            (platform) => !available.has(platform.emulatorCore),
        ).map((platform) => `${platform.slug} -> ${platform.emulatorCore}`);
        expect(missing).toEqual([]);
    });
    it("every core reports a save extension", () => {
        const withoutSave = PLATFORM_REGISTRY.map((platform) => ({
            slug: platform.slug,
            core: platform.emulatorCore,
            save: (() => {
                const core = findCore(platform.emulatorCore);
                return core ? saveExtension(core) : null;
            })(),
        })).filter((entry) => !entry.save);
        expect(withoutSave).toEqual([]);
    });
    it("each platform's extensions are accepted by its core", () => {
        const problems: string[] = [];
        for (const platform of PLATFORM_REGISTRY) {
            const core = findCore(platform.emulatorCore);
            const accepted = new Set(core?.extensions ?? []);
            for (const extension of platform.extensions) {
                const bare = extension.replace(/^\./, "");
                if (bare === "zip" || bare === "7z") continue;
                if (!accepted.has(bare)) {
                    problems.push(`${platform.slug}: ${extension} not in ${core?.name}`);
                }
            }
        }
        expect(problems).toEqual([]);
    });
});

describe.skipIf(installed)("EmulatorJS core contract (skipped)", () => {
    it("reports that the distribution is not installed", () => {
        expect(isEmulatorJsInstalled()).toBe(false);
    });
});