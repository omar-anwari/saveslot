import { access, constants } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { platforms } from "@/db/schema";
import { env } from "@/lib/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";

async function checkAccess(target: string, mode: number): Promise<CheckStatus> {
  try {
    await access(target, mode);
    return "ok";
  } catch {
    return "error";
  }
}

function checkDatabase(): CheckStatus {
  try {
    db.select({ id: platforms.id }).from(platforms).limit(1).all();
    return "ok";
  } catch {
    return "error";
  }
}

export async function GET() {
  const [libraryReadable, dataWritable] = await Promise.all([
    checkAccess(env.romLibraryPath, constants.R_OK),
    checkAccess(env.appDataPath, constants.W_OK),
  ]);

  const checks = {
    libraryReadable,
    dataWritable,
    databaseReachable: checkDatabase(),
  };
  const healthy = Object.values(checks).every((status) => status === "ok");

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      appName: env.APP_NAME,
      environment: env.NODE_ENV,
      checks,
    },
    { status: healthy ? 200 : 503 },
  );
}