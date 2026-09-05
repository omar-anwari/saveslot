import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { Transform, type Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

export const MAX_ENTRIES = 2000;
export const MAX_ENTRY_UNCOMPRESSED = 1024 * 1024 * 1024;
export const MAX_TOTAL_UNCOMPRESSED = 4 * 1024 * 1024;
export const MAX_COMPRESSION_RATIO = 1000;

const MAX_CENTRAL_DIRECTORY_BYTES = 8 * 1024 * 1024;
const EOCD_SEARCH_BYTES = 65535 + 22;

export class ZipError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ZipError";
    }
}

export interface ZipEntry {
    name: string;
    method: number;
    compressedSize: number;
    uncompressedSize: number;
    crc32: string;
    localHeaderOffset: number;
}

async function readAt(
    path: string,
    position: number,
    length: number,
): Promise<Buffer> {
    const handle = await open(path, "r");
    try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, position);
        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close()
    }
}

function isUnsafeName(name: string): boolean {
    if (name.length === 0 || name.includes("\0")) return true;
    if (name.startsWith("/") || /^[a-zA-Z]:/.test(name)) return true;
    return name
        .split(/[/\\]/)
        .some((segment) => segment === "..");
}

export async function readZipEntries(path: string): Promise<ZipEntry[]> {
    const { size } = await stat(path);
    if (size < 22) throw new ZipError("File is too small to be a zip archive.");
    const tailLength = Math.min(size, EOCD_SEARCH_BYTES);
    const tail = await readAt(path, size - tailLength, tailLength);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
        if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new ZipError("No end-of-central-directory record found.");
    const entryCount = tail.readUInt16LE(eocd + 10);
    const directorySize = tail.readUInt32LE(eocd + 12);
    const directoryOffset = tail.readUInt32LE(eocd + 16);
    if (
        entryCount === 0xffff ||
        directorySize === 0xffffffff ||
        directoryOffset === 0xffffffff
    ) {
        throw new ZipError("Zip64 archives are not supported.");
    }
    if (entryCount > MAX_ENTRIES) {
        throw new ZipError(
            `Archive declares ${entryCount} entries; the limit is ${MAX_ENTRIES}.`,
        );
    }
    if (directorySize > MAX_CENTRAL_DIRECTORY_BYTES) {
        throw new ZipError("Central directory is implausibly large.");
    }
    if (directoryOffset + directorySize > size) {
        throw new ZipError("Central directory extends past the end of the file.");
    }
    const directory = await readAt(path, directoryOffset, directorySize);
    const entries: ZipEntry[] = [];
    let cursor = 0;
    let totalUncompressed = 0;
    for (let index = 0; index < entryCount; index += 1) {
        if (cursor + 46 > directory.length) {
            throw new ZipError("Central directory ended unexpectedly.");
        }
        if (directory.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
            throw new ZipError("Malformed central directory entry.");
        }
        const flags = directory.readUInt16LE(cursor + 8);
        const method = directory.readUInt16LE(cursor + 10);
        const crc = directory.readUInt32LE(cursor + 16);
        const compressedSize = directory.readUInt32LE(cursor + 20);
        const uncompressedSize = directory.readUInt32LE(cursor + 24);
        const nameLength = directory.readUInt16LE(cursor + 28);
        const extraLength = directory.readUInt16LE(cursor + 30);
        const commentLength = directory.readUInt16LE(cursor + 32);
        const localHeaderOffset = directory.readUInt32LE(cursor + 42);
        const name = directory
            .subarray(cursor + 46, cursor + 46 + nameLength)
            .toString("utf8");
        cursor += 46 + nameLength + extraLength + commentLength;
        if (name.endsWith("/")) continue;
        if ((flags & 0x1) !== 0) {
            throw new ZipError(`Encrypted entry is not supported: ${name}`);
        }
        if (isUnsafeName(name)) {
            throw new ZipError(`Refusing an entry with an unsafe path: ${name}`);
        }
        if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
            throw new ZipError(`Unsupported compression method ${method}: ${name}`);
        }
        if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED) {
            throw new ZipError(`Entry is implausibly large: ${name}`);
        }
        if (
            compressedSize > 0 &&
            uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO
        ) {
            throw new ZipError(`Entry compression ratio is implausible: ${name}`);
        }
        totalUncompressed += uncompressedSize;
        if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
            throw new ZipError("Archive expands to an implausible total size.");
        }
        entries.push({
            name,
            method,
            compressedSize,
            uncompressedSize,
            crc32: (crc >>> 0).toString(16).padStart(8, "0"),
            localHeaderOffset,
        });
    }
    return entries;
}

function capBytes(limit: number): Transform {
    let seen = 0;
    return new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            seen += chunk.length;
            if (seen > limit) {
                callback(new ZipError("Entry produced more data than it declared."));
                return;
            }
            callback(null, chunk);
        },
    });
}

export async function openZipEntry(
    path: string,
    entry: ZipEntry,
): Promise<Readable> {
    const header = await readAt(path, entry.localHeaderOffset, 30);
    if (header.length < 30 || header.readUInt32LE(0) !== LOCAL_SIGNATURE) {
        throw new ZipError(`Missing local header for ${entry.name}`);
    }
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
    const source = createReadStream(path, {
        start: dataStart,
        end: dataStart + entry.compressedSize - 1,
    });
    const capped = source.pipe(capBytes(entry.compressedSize));
    if (entry.method === METHOD_STORED) return capped;
    return capped
        .pipe(createInflateRaw())
        .pipe(capBytes(entry.uncompressedSize));
}

export function findSingleRomEntry(
    entries: readonly ZipEntry[],
    extensions: readonly string[],
): ZipEntry | null {
    const allowed = new Set(
        extensions.map((extension) => extension.toLowerCase()).filter((e) => e !== ".zip"),
    );
    const candidates = entries.filter((entry) => {
        const dot = entry.name.lastIndexOf(".");
        if (dot < 0) return false;
        return allowed.has(entry.name.slice(dot).toLowerCase());
    });
    return candidates.length === 1 ? (candidates[0] ?? null) : null;
}