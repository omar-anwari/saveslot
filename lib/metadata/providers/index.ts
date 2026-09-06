import path from "node:path";
import { env } from "../../config/env.ts";
import type { MetadataProvider } from "../types.ts";
import { createHasheousProvider } from "./hasheous.ts";
import { createFileTokenStore, createIgdbClient } from "./igdb-client.ts";
import { createIgdbProvider } from "./igdb.ts";

export interface ConfiguredProviders {
    identifier: MetadataProvider | null;
    enricher: MetadataProvider | null;
}

export async function configuredProviders(): Promise<ConfiguredProviders> {
    const hasheous = createHasheousProvider({
        baseUrl: env.HASHEOUS_BASE_URL,
        timeoutMs: env.METADATA_REQUEST_TIMEOUT_MS,
        enabled: env.hasheousEnabled,
    });
    const igdbCredentialed =
        env.IGDB_CLIENT_ID.length > 0 && env.IGDB_CLIENT_SECRET.length > 0;
    const igdb = igdbCredentialed
        ? createIgdbProvider({
            enabled: true,
            client: createIgdbClient({
                clientId: env.IGDB_CLIENT_ID,
                clientSecret: env.IGDB_CLIENT_SECRET,
                tokenStore: createFileTokenStore(
                    path.join(env.appDataPath, "igdb-token.json"),
                ),
            }),
        })
        : null;
    return {
        identifier: (await hasheous.isConfigured()) ? hasheous : null,
        enricher: igdb !== null && (await igdb.isConfigured()) ? igdb : null,
    };
}