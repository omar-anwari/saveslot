export type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "avif";

export const MIME_BY_FORMAT: Readonly<Record<ImageFormat, string>> = {
    png: "image/png",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
};

function startsWith(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
    if (bytes.length < offset + signature.length) return false;
    return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
    return startsWith(bytes, offset, [...text].map((character) => character.charCodeAt(0)));
}

export function sniffImageFormat(bytes: Uint8Array): ImageFormat | null {
    if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
    if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return "jpeg";
    if (ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a")) return "gif";
    if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return "webp";
    if (ascii(bytes, 4, "ftyp") && (ascii(bytes, 8, "avif") || ascii(bytes, 8, "avis"))) return "avif";
    return null;
}