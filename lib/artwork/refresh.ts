import { env } from "../config/env.ts";
import type { MetadataDatabase } from "../metadata/lookup-cache.ts";
import { cacheCoverArt, type CoverOutcome } from "./service.ts";

export async function refreshCoverArt(
    db: MetadataDatabase,
    gameId: number,
): Promise<CoverOutcome> {
    try {
        const result = await cacheCoverArt(db, gameId, {
            dataRoot: env.appDataPath,
            timeoutMs: env.METADATA_REQUEST_TIMEOUT_MS,
        });
        return result.outcome;
    } catch {
        return "error";
    }
}