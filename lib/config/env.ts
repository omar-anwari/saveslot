// This is a server only config that's validated once at the first import
import "server-only";
import { z } from "zod";
import path from "node:path";

// Relative paths in .env resolve from the repo's root
// During dev this'll be the the directory where next dev was run
// In the docker image, it's the app's working directory
const REPO_ROOT = process.cwd();

// Hash algorithms that the scanner computes
const HASH_ALGORITHMS = ["crc32", "md5", "sha1"] as const;
type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

// Accepted spellings for boolean environment variables
const TRUTHY = new Set(["true", "1", "yes", "on", "y", "enabled"]);
const FALSY = new Set(["false", "0", "no", "off", "n", "disabled"]);

// Version strings that won't be used for releases
const FLOATING_VERSIONS = new Set(["latest", "nightly", "main", "master", "canary"]);

// Placeholder Secret CHANGE IN PROD
const SESSION_SECRET_PLACEHOLDER = "REPLACE_WITH_LONG_RANDOM_STRING";

const EnvSchema = z.object({
    // Core Paths
    ROM_LIBRARY_PATH: z.string().min(1).default("./dev-library"),
    APP_DATA_PATH: z.string().min(1).default("./dev-data"),
    DATABASE_URL: z.string().min(1).default("./dev-data/app.sqlite"),

    // The app
    APP_URL: z
        .string()
        .default("http://localhost:3000")
        .refine((value) => URL.canParse(value)),
    APP_NAME: z.string().min(1).default("SaveSlot"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    // Optional password and session secret
    APP_PASSWORD: z.string().default(""),
    SESSION_SECRET: z.string().default(""),

    // Metadata from Hasheous, IGDB, Screenscraper
    HASHEOUS_ENABLED: z.string().default("true"),
    IGDB_CLIENT_ID: z.string().default(""),
    IGDB_CLIENT_SECRET: z.string().default(""),
    SCREENSCRAPER_USERNAME: z.string().default(""),
    SCREENSCRAPER_PASSWORD: z.string().default(""),
    SCREENSCRAPER_DEV_ID: z.string().default(""),
    SCREENSCRAPER_DEV_PASSWORD: z.string().default(""),

    // Scanning
    SCAN_HASH_ALGORITHMS: z.string().default("crc32,md5,sha1"),
    SCAN_CONCURRENCY: z.coerce.number().int().positive().max(32).default(2),
    METADATA_CONCURRENCY: z.coerce.number().int().positive().max(16).default(1),
    METADATA_REQUEST_DELAY_MS: z.coerce.number().int().nonnegative().default(250),

    // EmulatorJS
    EMULATORJS_VERSION: z.string().default(""),
    EMULATORJS_DATA_PATH: z.string().min(1).default("/emulatorjs/data/"),
    EMULATORJS_FIXED_SAVE_INTERVAL_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(15000),
    EMULATORJS_THREADS: z.enum(["auto", "on", "off"]).default("auto"),

    // Uploading
    MAX_SAVE_BYTES: z.coerce.number().int().positive().default(16777216), // 16MB
    MAX_STATE_BYTES: z.coerce.number().int().positive().default(536870912), // 512MB
    SAVE_HISTORY_LIMIT: z.coerce.number().int().positive().default(10),
    STATE_HISTORY_LIMIT: z.coerce.number().int().positive().default(25),

    // DEV/TESTING SHIT
    ALLOW_FAKE_ROM_FIXTURES: z.string().default("false"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
    throw new Error(
        `Invalid environment configuration:\n${z.prettifyError(parsed.error)}`,
    );
}

const raw = parsed.data;

function configError(message: string): never {
    throw new Error(`Invalid environment configuration:\n${message}`);
}

function parseBoolean(name: string, value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (TRUTHY.has(normalized)) return true;
    if (FALSY.has(normalized)) return false;
    return configError(
        `${name} must be a boolean value. Received "${value}". ` +
        `Accepted: ${[...TRUTHY].join(", ")} / ${[...FALSY].join(", ")}.`,
    );
}

function isHashAlgorithm(value: string): value is HashAlgorithm {
    return (HASH_ALGORITHMS as readonly string[]).includes(value);
}

function parseHashAlgorithms(value: string): HashAlgorithm[] {
    const requested = value
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.length > 0);

    const unsupported = requested.filter((part) => !isHashAlgorithm(part));
    if (unsupported.length > 0) {
        configError(
            `SCAN_HASH_ALGORITHMS lists unsupported values: ${unsupported.join(", ")}. ` +
            `Supported: ${HASH_ALGORITHMS.join(", ")}.`,
        );
    }

    const supported = requested.filter(isHashAlgorithm);
    if (supported.length === 0) {
        configError("SCAN_HASH_ALGORITHMS must name at least one algorithm.");
    }
    return supported;
}

// Cross field rules since Zod can't express field by field
const emulatorJsVersion = raw.EMULATORJS_VERSION ?? "";
if (
    emulatorJsVersion.length > 0 &&
    FLOATING_VERSIONS.has(emulatorJsVersion.toLowerCase())
) {
    configError(
        `EMULATORJS_VERSION must name an exact release, not "${emulatorJsVersion}"`,
    );
}

const appPassword = raw.APP_PASSWORD ?? "";
const sessionSecret = raw.SESSION_SECRET ?? "";
const appPasswordEnabled = appPassword.length > 0;

if (appPasswordEnabled) {
    if (sessionSecret === SESSION_SECRET_PLACEHOLDER) {
        configError(
            "SESSION_SECRET is still the placeholder from .env.example " +
            "Set a long random value before enabling APP_PASSWORD",
        );
    }
    if (sessionSecret.length < 32) {
        configError(
            "SESSION_SECRET must be at least 32 characters when APP_PASSWORD is set",
        );
    }
}

// Resolve a configured path to an absolute one without touching anything
function resolveFromRoot(value: string): string {
    return path.isAbsolute(value) ? value : path.resolve(REPO_ROOT, value);
}

export const env = Object.freeze({
    ...raw,
    romLibraryPath: resolveFromRoot(raw.ROM_LIBRARY_PATH),
    appDataPath: resolveFromRoot(raw.APP_DATA_PATH),
    databasePath: resolveFromRoot(raw.DATABASE_URL),
    scanHashAlgorithms: parseHashAlgorithms(raw.SCAN_HASH_ALGORITHMS),
    hasheousEnabled: parseBoolean("HASHEOUS_ENABLED", raw.HASHEOUS_ENABLED),
    allowFakeRomFixtures: parseBoolean(
        "ALLOW_FAKE_ROM_FIXTURES",
        raw.ALLOW_FAKE_ROM_FIXTURES,
    ),
    appPasswordEnabled,
    emulatorJsPinned: emulatorJsVersion.length > 0,
});

export type Env = typeof env;
export type { HashAlgorithm };