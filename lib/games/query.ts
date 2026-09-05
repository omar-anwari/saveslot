import { and, asc, desc, eq, sql, type SQL, gt, notInArray } from "drizzle-orm";
import { gameFiles, games, platforms } from "../../db/schema.ts";
import type { ScanDatabase } from "../scanning/scan-run.ts";

export const GAME_SORTS = [
    "title",
    "recently-added",
    "last-played",
    "release-year",
    "playtime",
    "random",
] as const;
export type GameSort = (typeof GAME_SORTS)[number];

export const PLAY_STATUS_VALUES = [
    "unplayed",
    "playing",
    "completed",
    "abandoned",
    "backlog",
] as const;
export type PlayStatusValue = (typeof PLAY_STATUS_VALUES)[number];

export const DEFAULT_PAGE_SIZE = 48;
export const MAX_PAGE_SIZE = 100;

export interface GameQuery {
    q?: string;
    platform?: string;
    year?: number;
    favourite?: boolean;
    status?: PlayStatusValue;
    present?: boolean;
    includeHidden?: boolean;
    sort?: GameSort;
    page?: number;
    pageSize?: number;
}

export interface GameListItem {
    slug: string;
    title: string;
    platformSlug: string;
    platformName: string;
    releaseYear: number | null;
    favourite: boolean;
    hidden: boolean;
    playStatus: string;
    metadataStatus: string;
    lastPlayedAt: Date | null;
    totalPlaySeconds: number;
    present: boolean;
}

export interface GameQueryResult {
    games: GameListItem[];
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
}

const GAME_LIST_COLUMNS = {
    slug: games.slug,
    title: games.title,
    platformSlug: platforms.slug,
    platformName: platforms.name,
    releaseYear: games.releaseYear,
    favourite: games.favourite,
    hidden: games.hidden,
    playStatus: games.playStatus,
    metadataStatus: games.metadataStatus,
    lastPlayedAt: games.lastPlayedAt,
    totalPlaySeconds: games.totalPlaySeconds,
    present: sql<boolean>`exists (
    select 1 from ${gameFiles}
    where ${gameFiles.gameId} = ${games.id} and ${gameFiles.present} = 1
  )`,
};

const presentExpression = sql<boolean>`exists (
  select 1 from ${gameFiles}
  where ${gameFiles.gameId} = ${games.id} and ${gameFiles.present} = 1
)`;

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function buildConditions(query: GameQuery): SQL[] {
    const conditions: SQL[] = [];
    const term = query.q?.trim();
    if (term) {
        const pattern = `%${escapeLike(term.toLowerCase())}%`;
        conditions.push(sql`${games.sortTitle} like ${pattern} escape '\\'`);
    }
    if (query.platform) conditions.push(eq(platforms.slug, query.platform));
    if (query.year !== undefined) conditions.push(eq(games.releaseYear, query.year));
    if (query.favourite !== undefined) {
        conditions.push(eq(games.favourite, query.favourite));
    }
    if (query.status) conditions.push(eq(games.playStatus, query.status));
    if (!query.includeHidden) conditions.push(eq(games.hidden, false));
    if (query.present !== undefined) {
        conditions.push(
            query.present
                ? sql`${presentExpression}`
                : sql`not ${presentExpression}`,
        );
    }
    return conditions;
}

function buildOrderBy(sort: GameSort): SQL[] {
    switch (sort) {
        case "recently-added":
            return [desc(games.createdAt), asc(games.id)];
        case "last-played":
            return [
                sql`${games.lastPlayedAt} is null`,
                desc(games.lastPlayedAt),
                asc(games.id),
            ];
        case "release-year":
            return [
                sql`${games.releaseYear} is null`,
                desc(games.releaseYear),
                asc(games.sortTitle),
            ];
        case "playtime":
            return [desc(games.totalPlaySeconds), asc(games.id)];
        case "random":
            return [sql`random()`];
        case "title":
        default:
            return [asc(games.sortTitle), asc(games.id)];
    }
}

export function queryGames(
    db: ScanDatabase,
    query: GameQuery = {},
): GameQueryResult {
    const pageSize = Math.min(
        Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1),
        MAX_PAGE_SIZE,
    );
    const page = Math.max(query.page ?? 1, 1);
    const offset = (page - 1) * pageSize;
    const conditions = buildConditions(query);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = db
        .select(GAME_LIST_COLUMNS)
        .from(games)
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .where(where)
        .orderBy(...buildOrderBy(query.sort ?? "title"))
        .limit(pageSize)
        .offset(offset)
        .all();
    const totalRow = db
        .select({ value: sql<number>`count(*)` })
        .from(games)
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .where(where)
        .get();
    const total = totalRow?.value ?? 0;
    return {
        games: rows.map((row) => ({ ...row, present: Boolean(row.present) })),
        total,
        page,
        pageSize,
        pageCount: Math.max(Math.ceil(total / pageSize), 1),
    };
}

export interface GameFileDetail {
    relativePath: string;
    fileName: string;
    extension: string;
    sizeBytes: number;
    modifiedAtFs: Date;
    crc32: string | null;
    md5: string | null;
    sha1: string | null;
    discNumber: number | null;
    fileRole: string;
    present: boolean;
    isFixture: boolean;
}

export interface GameDetail {
    slug: string;
    title: string;
    originalTitle: string | null;
    filenameTitle: string;
    summary: string | null;
    releaseDate: string | null;
    releaseYear: number | null;
    developer: string | null;
    publisher: string | null;
    genres: string[];
    players: number | null;
    rating: number | null;
    region: string | null;
    revision: string | null;
    language: string | null;
    metadataStatus: string;
    metadataProvider: string | null;
    metadataConfidence: number | null;
    favourite: boolean;
    hidden: boolean;
    playStatus: string;
    lastPlayedAt: Date | null;
    totalPlaySeconds: number;
    platform: {
        slug: string;
        name: string;
        manufacturer: string | null;
        emulatorCore: string | null;
        experimental: boolean;
        requiresBios: boolean;
    };
    files: GameFileDetail[];
}

export function getGameDetail(
    db: ScanDatabase,
    slug: string,
): GameDetail | null {
    const row = db
        .select({
            id: games.id,
            slug: games.slug,
            title: games.title,
            originalTitle: games.originalTitle,
            filenameTitle: games.filenameTitle,
            summary: games.summary,
            releaseDate: games.releaseDate,
            releaseYear: games.releaseYear,
            developer: games.developer,
            publisher: games.publisher,
            genresJson: games.genresJson,
            players: games.players,
            rating: games.rating,
            region: games.region,
            revision: games.revision,
            language: games.language,
            metadataStatus: games.metadataStatus,
            metadataProvider: games.metadataProvider,
            metadataConfidence: games.metadataConfidence,
            favourite: games.favourite,
            hidden: games.hidden,
            playStatus: games.playStatus,
            lastPlayedAt: games.lastPlayedAt,
            totalPlaySeconds: games.totalPlaySeconds,
            platformSlug: platforms.slug,
            platformName: platforms.name,
            manufacturer: platforms.manufacturer,
            emulatorCore: platforms.emulatorCore,
            experimental: platforms.experimental,
            requiresBios: platforms.requiresBios,
        })
        .from(games)
        .innerJoin(platforms, eq(games.platformId, platforms.id))
        .where(eq(games.slug, slug))
        .get();
    if (!row) return null;
    const files = db
        .select({
            relativePath: gameFiles.relativePath,
            fileName: gameFiles.fileName,
            extension: gameFiles.extension,
            sizeBytes: gameFiles.sizeBytes,
            modifiedAtFs: gameFiles.modifiedAtFs,
            crc32: gameFiles.crc32,
            md5: gameFiles.md5,
            sha1: gameFiles.sha1,
            discNumber: gameFiles.discNumber,
            fileRole: gameFiles.fileRole,
            present: gameFiles.present,
            isFixture: gameFiles.isFixture,
        })
        .from(gameFiles)
        .where(eq(gameFiles.gameId, row.id))
        .orderBy(asc(gameFiles.relativePath))
        .all();
    return {
        slug: row.slug,
        title: row.title,
        originalTitle: row.originalTitle,
        filenameTitle: row.filenameTitle,
        summary: row.summary,
        releaseDate: row.releaseDate,
        releaseYear: row.releaseYear,
        developer: row.developer,
        publisher: row.publisher,
        genres: row.genresJson,
        players: row.players,
        rating: row.rating,
        region: row.region,
        revision: row.revision,
        language: row.language,
        metadataStatus: row.metadataStatus,
        metadataProvider: row.metadataProvider,
        metadataConfidence: row.metadataConfidence,
        favourite: row.favourite,
        hidden: row.hidden,
        playStatus: row.playStatus,
        lastPlayedAt: row.lastPlayedAt,
        totalPlaySeconds: row.totalPlaySeconds,
        platform: {
            slug: row.platformSlug,
            name: row.platformName,
            manufacturer: row.manufacturer,
            emulatorCore: row.emulatorCore,
            experimental: row.experimental,
            requiresBios: row.requiresBios,
        },
        files,
    };
}

function toListItems(
    rows: Array<Omit<GameListItem, "present"> & { present: unknown }>,
): GameListItem[] {
    return rows.map((row) => ({ ...row, present: Boolean(row.present) }));
}

function baseListQuery(db: ScanDatabase) {
    return db.select(GAME_LIST_COLUMNS).from(games).innerJoin(
        platforms,
        eq(games.platformId, platforms.id)
    );
}

export function continuePlaying(
  db: ScanDatabase,
  limit = 12,
): GameListItem[] {
  return toListItems(
    baseListQuery(db)
      .where(
        and(
          eq(games.hidden, false),
          gt(games.totalPlaySeconds, 0),
          notInArray(games.playStatus, ["completed", "abandoned"]),
        ),
      )
      .orderBy(desc(games.lastPlayedAt))
      .limit(limit)
      .all(),
  );
}

export function recentlyAdded(db: ScanDatabase, limit = 12): GameListItem[] {
  return toListItems(
    baseListQuery(db)
      .where(eq(games.hidden, false))
      .orderBy(desc(games.createdAt), desc(games.id))
      .limit(limit)
      .all(),
  );
}

export function favouriteGames(db: ScanDatabase, limit = 12): GameListItem[] {
  return toListItems(
    baseListQuery(db)
      .where(and(eq(games.hidden, false), eq(games.favourite, true)))
      .orderBy(asc(games.sortTitle))
      .limit(limit)
      .all(),
  );
}

// Only offer something that can actually be launched.
export function randomPick(db: ScanDatabase): GameListItem | null {
  const rows = toListItems(
    baseListQuery(db)
      .where(eq(games.hidden, false))
      .orderBy(sql`random()`)
      .limit(5)
      .all(),
  );
  return rows.find((row) => row.present) ?? rows[0] ?? null;
}

export interface PlatformSummary {
  slug: string;
  name: string;
  gameCount: number;
}

export function platformSummaries(db: ScanDatabase): PlatformSummary[] {
  return db
    .select({
      slug: platforms.slug,
      name: platforms.name,
      gameCount: sql<number>`count(${games.id})`,
    })
    .from(platforms)
    .leftJoin(
      games,
      and(eq(games.platformId, platforms.id), eq(games.hidden, false)),
    )
    .where(eq(platforms.enabled, true))
    .groupBy(platforms.id)
    .orderBy(asc(platforms.name))
    .all();
}