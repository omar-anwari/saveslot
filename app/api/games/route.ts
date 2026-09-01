import { NextResponse } from "next/server";

import { db } from "@/db/client";
import { errorResponse } from "../errors";
import {
    GAME_SORTS,
    PLAY_STATUS_VALUES,
    queryGames,
    type GameSort,
    type PlayStatusValue,
} from "@/lib/games/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSort(value: string): value is GameSort {
    return (GAME_SORTS as readonly string[]).includes(value);
}

function isStatus(value: string): value is PlayStatusValue {
    return (PLAY_STATUS_VALUES as readonly string[]).includes(value);
}

function readBoolean(value: string | null): boolean | null | undefined {
    if (value === null) return undefined;
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
}

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const sortParam = params.get("sort");
    if (sortParam !== null && !isSort(sortParam)) {
        return errorResponse(400, "BAD_REQUEST", "Unknown sort order.", {
            supported: [...GAME_SORTS],
        });
    }
    const statusParam = params.get("status");
    if (statusParam !== null && !isStatus(statusParam)) {
        return errorResponse(400, "BAD_REQUEST", "Unknown play status.", {
            supported: [...PLAY_STATUS_VALUES],
        });
    }

    const favourite = readBoolean(params.get("favourite"));
    const present = readBoolean(params.get("present"));
    if (favourite === null || present === null) {
        return errorResponse(
            400,
            "BAD_REQUEST",
            "Boolean filters must be 'true' or 'false'.",
        );
    }

    const yearParam = params.get("year");
    const year = yearParam === null ? undefined : Number.parseInt(yearParam, 10);
    if (year !== undefined && !Number.isInteger(year)) {
        return errorResponse(400, "BAD_REQUEST", "Year must be a whole number.");
    }
    const page = Number.parseInt(params.get("page") ?? "1", 10);
    const pageSize = Number.parseInt(params.get("pageSize") ?? "", 10);
    const result = queryGames(db, {
        q: params.get("q") ?? undefined,
        platform: params.get("platform") ?? undefined,
        year,
        favourite,
        present,
        status: statusParam ?? undefined,
        sort: sortParam ?? undefined,
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    });

    return NextResponse.json(result);
}