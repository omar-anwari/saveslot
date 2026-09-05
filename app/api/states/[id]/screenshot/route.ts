import { open, rm, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { errorResponse } from "@/app/api/errors";
import { env } from "@/lib/config/env";
import { resolveRealPathWithinRoot } from "@/lib/filesystem/paths";
import { attachScreenshot, getSaveState } from "@/lib/saves/states";
import {
  EmptySaveError,
  PayloadTooLargeError,
  writeUploadToTemp,
} from "@/lib/saves/storage";
import { buildFileResponse } from "@/lib/streaming/file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function looksLikePng(path: string): Promise<boolean> {
  const handle = await open(path, "r");
  try {
    const header = Buffer.alloc(PNG_MAGIC.length);
    await handle.read(header, 0, header.length, 0);
    return header.equals(PNG_MAGIC);
  } finally {
    await handle.close();
  }
}

async function* streamBytes(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const state = getSaveState(db, id);
  if (!state?.screenshotRelativePath) {
    return errorResponse(404, "NOT_FOUND", "No screenshot for that state.");
  }
  let absolutePath: string;
  try {
    absolutePath = await resolveRealPathWithinRoot(
      env.appDataPath,
      state.screenshotRelativePath,
    );
  } catch {
    return errorResponse(404, "NOT_FOUND", "The screenshot could not be read.");
  }
  let stats;
  try {
    stats = await stat(absolutePath);
  } catch {
    return errorResponse(404, "NOT_FOUND", "The screenshot could not be read.");
  }
  return buildFileResponse({
    absolutePath,
    size: stats.size,
    modifiedAt: new Date(Math.floor(stats.mtimeMs / 1000) * 1000),
    downloadName: `${state.id}.png`,
    method: "GET",
    rangeHeader: request.headers.get("range"),
    ifNoneMatch: request.headers.get("if-none-match"),
    contentType: "image/png",
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!getSaveState(db, id)) {
    return errorResponse(404, "NOT_FOUND", "No state with that id.");
  }
  if (!request.body) {
    return errorResponse(400, "BAD_REQUEST", "Request body is empty.");
  }
  try {
    const upload = await writeUploadToTemp(
      env.appDataPath,
      streamBytes(request.body),
      MAX_SCREENSHOT_BYTES,
    );
    if (!(await looksLikePng(upload.tempPath))) {
      await rm(upload.tempPath, { force: true });
      return errorResponse(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Screenshots must be PNG.",
      );
    }
    const attached = await attachScreenshot(db, env.appDataPath, id, upload);
    if (!attached) {
      return errorResponse(404, "NOT_FOUND", "No state with that id.");
    }
    return NextResponse.json({ stateId: id, hasScreenshot: true }, { status: 201 });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return errorResponse(413, "PAYLOAD_TOO_LARGE", "The screenshot is too large.");
    }
    if (error instanceof EmptySaveError) {
      return errorResponse(400, "BAD_REQUEST", "The screenshot was empty.");
    }
    return errorResponse(500, "INTERNAL_ERROR", "The screenshot could not be stored.");
  }
}