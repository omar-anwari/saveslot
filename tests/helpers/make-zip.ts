import { deflateRawSync } from "node:zlib";
import { Crc32 } from "../../lib/hashing/file-hashes.ts";

export interface ZipFileInput {
    name: string;
    content: Uint8Array;
    deflate?: boolean;
    declaredUncompressedSize?: number;
}

function crc32Of(content: Uint8Array): number {
    const crc = new Crc32();
    crc.update(content);
    return Number.parseInt(crc.digest(), 16);
}

export function makeZip(files: ZipFileInput[]): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const file of files) {
        const name = Buffer.from(file.name, "utf8");
        const stored = file.deflate
            ? Buffer.from(deflateRawSync(Buffer.from(file.content)))
            : Buffer.from(file.content);
        const method = file.deflate ? 8 : 0;
        const crc = crc32Of(file.content);
        const uncompressed =
            file.declaredUncompressedSize ?? file.content.length;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(stored.length, 18);
        local.writeUInt32LE(uncompressed, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, name, stored);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(stored.length, 20);
        central.writeUInt32LE(uncompressed, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);
        offset += local.length + name.length + stored.length;
    }
    const localPart = Buffer.concat(locals);
    const centralPart = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralPart.length, 12);
    eocd.writeUInt32LE(localPart.length, 16);
    return Buffer.concat([localPart, centralPart, eocd]);
}