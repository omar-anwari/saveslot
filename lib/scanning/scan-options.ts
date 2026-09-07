import { env } from "../config/env.ts";

export function scanEnvironmentOptions() {
    return {
        libraryRoot: env.romLibraryPath,
        hashConcurrency: env.SCAN_CONCURRENCY,
        algorithms: env.scanHashAlgorithms,
        allowFixtures: env.allowFakeRomFixtures,
    };
}