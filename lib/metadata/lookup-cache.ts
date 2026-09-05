import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema.ts";
import { metadataLookups } from "../../db/schema.ts";
import type { HashAlgorithm } from "../hashing/file-hashes.ts";

export type MetadataDatabase = BetterSQLite3Database<typeof schema>;
export type LookupStatus = (typeof schema.METADATA_LOOKUP_STATUSES)[number];
export const NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ERROR_TTL_MS = 60 * 60 * 1000;
export interface LookupKey {
    providerKey: string;
    algorithm: HashAlgorithm;
    value: string;
}
export interface CachedLookup {
    status: LookupStatus;
    payload: unknown;
    errorMessage: string | null;
    latencyMs: number | null;
    fetchedAt: Date;
}
export interface LookupEntry {
    status: LookupStatus;
    payload?: unknown;
    errorMessage?: string | null;
    latencyMs?: number | null;
    ttlMs?: number | null;
}

const HASH_PREFERENCE: readonly HashAlgorithm[] = ["sha1", "md5", "crc32"];

export function chooseLookupHash(hashes: {
    sha1: string | null;
    md5: string | null;
    crc32: string | null;
}): { algorithm: HashAlgorithm; value: string } | null {
    for (const algorithm of HASH_PREFERENCE) {
        const raw = hashes[algorithm];
        if (typeof raw !== "string") continue;
        const value = raw.trim().toLowerCase();
        if (value.length > 0) return { algorithm, value };
    }
    return null;
}

export const MAX_ERROR_TTL_MS = 6 * 60 * 60 * 1000;

function expiryFor(status: LookupStatus, now: Date, ttlMs?: number | null): Date | null {
    if (status === "matched") return null;
    if (typeof ttlMs === "number" && ttlMs >= 0) {
        return new Date(now.getTime() + Math.min(ttlMs, MAX_ERROR_TTL_MS));
    }
    const ttl = status === "not_found" ? NOT_FOUND_TTL_MS : ERROR_TTL_MS;
    return new Date(now.getTime() + ttl);
}

function whereKey(key: LookupKey) {
    return and(
        eq(metadataLookups.providerKey, key.providerKey),
        eq(metadataLookups.hashAlgorithm, key.algorithm),
        eq(metadataLookups.hashValue, key.value),
    );
}

export function readLookup(
    db: MetadataDatabase,
    key: LookupKey,
    now: Date = new Date(),
): CachedLookup | null {
    const row = db.select().from(metadataLookups).where(whereKey(key)).get();
    if (row === undefined) return null;
    if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) return null;

    return {
        status: row.status,
        payload: row.responseJson ?? null,
        errorMessage: row.errorMessage,
        latencyMs: row.latencyMs,
        fetchedAt: row.fetchedAt,
    };
}

export function writeLookup(
    db: MetadataDatabase,
    key: LookupKey,
    entry: LookupEntry,
    now: Date = new Date(),
): void {
    const values = {
        status: entry.status,
        responseJson: entry.payload ?? null,
        errorMessage: entry.errorMessage ?? null,
        latencyMs: entry.latencyMs ?? null,
        fetchedAt: now,
        expiresAt: expiryFor(entry.status, now, entry.ttlMs),
    };
    db.insert(metadataLookups)
        .values({
            providerKey: key.providerKey,
            hashAlgorithm: key.algorithm,
            hashValue: key.value,
            ...values,
        })
        .onConflictDoUpdate({
            target: [
                metadataLookups.providerKey,
                metadataLookups.hashAlgorithm,
                metadataLookups.hashValue,
            ],
            set: values,
        })
        .run();
}

export function purgeExpiredLookups(db: MetadataDatabase, now: Date = new Date()): number {
    const result = db
        .delete(metadataLookups)
        .where(and(isNotNull(metadataLookups.expiresAt), lte(metadataLookups.expiresAt, now)))
        .run();
    return result.changes;
}