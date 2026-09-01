import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const MANIFEST_PATH = path.resolve(
    process.cwd(),
    "public/emulatorjs/data/cores/cores.json",
);

const CoreSchema = z.object({
    name: z.string().min(1),
    extensions: z.array(z.string()).optional(),
    save: z.union([z.string(), z.boolean()]).optional(),
    license: z.string().optional(),
});

export type CoreDefinition = z.infer<typeof CoreSchema>;
export function isEmulatorJsInstalled(): boolean {
    return existsSync(MANIFEST_PATH);
}
export function loadCoreManifest(): CoreDefinition[] {
    const raw: unknown = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    const entries = Array.isArray(raw)
        ? raw
        : Object.values(raw as Record<string, unknown>);
    return z.array(CoreSchema).parse(entries);
}
export function coreNames(): Set<string> {
    return new Set(loadCoreManifest().map((core) => core.name));
}
export function findCore(name: string): CoreDefinition | undefined {
    return loadCoreManifest().find((core) => core.name === name);
}
export function saveExtension(core: CoreDefinition): string | null {
    return typeof core.save === "string" && core.save.length > 0
        ? core.save
        : null;
}