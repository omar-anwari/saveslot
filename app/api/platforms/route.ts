import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { platforms } from "@/db/schema";
import { errorResponse } from "../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = db.select().from(platforms).orderBy(asc(platforms.name)).all();
    return NextResponse.json({
      platforms: rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        manufacturer: row.manufacturer,
        generation: row.generation,
        emulatorCore: row.emulatorCore,
        extensions: row.extensionsJson,
        folderAliases: row.folderAliasesJson,
        requiresBios: row.requiresBios,
        experimental: row.experimental,
        enabled: row.enabled,
      })),
    });
  } catch {
    return errorResponse(500, "INTERNAL_ERROR", "Unable to load platforms.");
  }
}