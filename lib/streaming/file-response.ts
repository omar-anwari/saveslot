import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import {
    contentRangeHeader,
    parseRangeHeader,
    unsatisfiedRangeHeader,
} from "./range.ts";

function sanitizeFilename(name: string): string {
    const cleaned = [...name]
        .filter((character) => {
            const code = character.charCodeAt(0);
            return code > 31 && code !== 127 && !'"\\'.includes(character);
        })
        .join("")
        .trim();
    return cleaned.length > 0 ? cleaned : "download";
}

function contentDisposition(name: string): string {
    const safe = sanitizeFilename(name);
    const ascii = [...safe]
        .map((character) => (character.charCodeAt(0) < 128 ? character : "_"))
        .join("");
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export interface FileResponseOptions {
    absolutePath: string;
    size: number;
    modifiedAt: Date;
    downloadName: string;
    method: "GET" | "HEAD";
    rangeHeader: string | null;
    ifNoneMatch: string | null;
    contentType?: string;
}

export function buildFileResponse(options: FileResponseOptions): Response {
    const {
        absolutePath,
        size,
        modifiedAt,
        downloadName,
        method,
        rangeHeader,
        ifNoneMatch,
        contentType = "application/octet-stream",
    } = options;

    const etag = `"${size.toString(16)}-${Math.floor(modifiedAt.getTime() / 1000).toString(16)}"`;
    const headers = new Headers({
        "content-type": contentType,
        "accept-ranges": "bytes",
        "content-disposition": contentDisposition(downloadName),
        etag,
        "last-modified": modifiedAt.toUTCString(),
        "cache-control": "private, no-cache",
        "x-content-type-options": "nosniff",
    });
    if (ifNoneMatch !== null && ifNoneMatch.split(",").some((tag) => tag.trim() === etag)) {
        return new Response(null, { status: 304, headers });
    }
    const range = parseRangeHeader(rangeHeader, size);
    if (range.type === "unsatisfiable") {
        headers.set("content-range", unsatisfiedRangeHeader(size));
        return new Response(null, { status: 416, headers });
    }
    const start = range.type === "range" ? range.start : 0;
    const end = range.type === "range" ? range.end : Math.max(size - 1, 0);
    const length = size === 0 ? 0 : end - start + 1;
    headers.set("content-length", String(length));
    if (range.type === "range") {
        headers.set("content-range", contentRangeHeader(start, end, size));
    }
    const status = range.type === "range" ? 206 : 200;
    if (method === "HEAD" || length === 0) {
        return new Response(null, { status, headers });
    }
    const nodeStream = createReadStream(absolutePath, { start, end });
    const body = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
    return new Response(body, { status, headers });
}