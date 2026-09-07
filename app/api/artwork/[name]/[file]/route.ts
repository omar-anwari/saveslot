import { readFile } from "node:fs/promises";
import path from "node:path";
import { artworkRelativePath } from "@/lib/artwork/storage";
import { env } from "@/lib/config/env";

export const runtime = "nodejs";

const NOT_FOUND = new Response("Not found", { status: 404 });

export async function GET(
    _request: Request,
    context: { params: Promise<{ name: string; file: string }> },
) {
    const { name, file } = await context.params;
    const match = /^([0-9a-f]{64})\.webp$/.exec(file);
    if (match?.[1] === undefined) return NOT_FOUND.clone();
    let relativePath: string;
    try {
        relativePath = artworkRelativePath(name, match[1]);
    } catch {
        return NOT_FOUND.clone();
    }
    let bytes: Buffer;
    try {
        bytes = await readFile(path.join(env.appDataPath, relativePath));
    } catch {
        return NOT_FOUND.clone();
    }
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
        headers: {
            "content-type": "image/webp",
            "content-length": String(bytes.byteLength),
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
        },
    });
}