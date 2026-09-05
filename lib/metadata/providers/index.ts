import { env } from "../../config/env.ts";
import type { MetadataProvider } from "../types.ts";
import { createHasheousProvider } from "./hasheous.ts";

export async function configuredProviders(): Promise<MetadataProvider[]> {
    const all: MetadataProvider[] = [
        createHasheousProvider({
            baseUrl: env.HASHEOUS_BASE_URL,
            timeoutMs: env.METADATA_REQUEST_TIMEOUT_MS,
            enabled: env.hasheousEnabled,
        }),
    ];
    const configured: MetadataProvider[] = [];
    for (const provider of all) {
        if (await provider.isConfigured()) configured.push(provider);
    }
    return configured;
}