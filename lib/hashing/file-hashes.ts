import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export type HashAlgorithm = "crc32" | "md5" | "sha1";

export const DEFAULT_ALGORITHMS: readonly HashAlgorithm[] = [
    "crc32",
    "md5",
    "sha1",
];

export class FileChangedDuringHashError extends Error {
    constructor(relativeHint: string) {
        super(`File changed while being hashed: ${relativeHint}`);
        this.name = "FileChangedDuringHashError";
    }
}

const CRC32_TABLE: Uint32Array = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
})();

export class Crc32 {
    #crc = 0xffffffff;

    update(chunk: Uint8Array): void {
        let crc = this.#crc;
        for (let i = 0; i < chunk.length; i += 1) {
            const byte = chunk[i]!;
            crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
        }
        this.#crc = crc;
    }

    digest(): string {
        return ((this.#crc ^ 0xffffffff) >>> 0)
            .toString(16)
            .padStart(8, "0");
    }
}

export interface FileHashes {
    crc32: string | null;
    md5: string | null;
    sha1: string | null;
}

export async function hashFile(
    absolutePath: string,
    algorithms: readonly HashAlgorithm[] = DEFAULT_ALGORITHMS,
): Promise<FileHashes> {
    const before = await stat(absolutePath);

    const crc = algorithms.includes("crc32") ? new Crc32() : null;
    const md5 = algorithms.includes("md5") ? createHash("md5") : null;
    const sha1 = algorithms.includes("sha1") ? createHash("sha1") : null;

    const stream = createReadStream(absolutePath, {
        highWaterMark: 1024 * 1024,
    });

    for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        crc?.update(buffer);
        md5?.update(buffer);
        sha1?.update(buffer);
    }

    const after = await stat(absolutePath);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
        throw new FileChangedDuringHashError(absolutePath.split("/").pop() ?? "");
    }

    return {
        crc32: crc?.digest() ?? null,
        md5: md5?.digest("hex") ?? null,
        sha1: sha1?.digest("hex") ?? null,
    };
}