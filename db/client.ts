import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "@/lib/config/env";
import * as schema from "./schema";

type SqliteDatabase = InstanceType<typeof Database>;

const globalForDb = globalThis as typeof globalThis & {
    __saveslotSqlite?: SqliteDatabase;
};

function createConnection(): SqliteDatabase {
    fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });
    const connection = new Database(env.databasePath);
    connection.pragma("journal_mode = WAL");
    connection.pragma("foreign_keys = ON");
    connection.pragma("busy_timeout = 5000");
    return connection;
}

export const sqlite = globalForDb.__saveslotSqlite ?? createConnection();
if (env.NODE_ENV !== "production") {
    globalForDb.__saveslotSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });