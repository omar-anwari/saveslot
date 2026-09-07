import sharp from "sharp";

export interface DerivativeSpec {
    name: string;
    width: number;
}

export const COVER_DERIVATIVES: readonly DerivativeSpec[] = [
    { name: "thumb", width: 264 },
    { name: "cover", width: 600 },
];

export const MAX_INPUT_PIXELS = 50_000_000;
export const MAX_DIMENSION = 12_000;
export const WEBP_QUALITY = 82;

export class ImageDecodeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ImageDecodeError";
    }
}

export interface Derivative {
    name: string;
    width: number;
    height: number;
    bytes: Uint8Array;
}

export interface DerivedImages {
    source: { format: string; width: number; height: number };
    derivatives: Derivative[];
}

export interface DeriveOptions {
    specs?: readonly DerivativeSpec[];
    maxInputPixels?: number;
    maxDimension?: number;
    quality?: number;
}

export async function deriveCoverImages(
    input: Uint8Array,
    options: DeriveOptions = {},
): Promise<DerivedImages> {
    const specs = options.specs ?? COVER_DERIVATIVES;
    const limitInputPixels = options.maxInputPixels ?? MAX_INPUT_PIXELS;
    const maxDimension = options.maxDimension ?? MAX_DIMENSION;
    const quality = options.quality ?? WEBP_QUALITY;
    const source = Buffer.from(input);
    let format: string | undefined;
    let width: number | undefined;
    let height: number | undefined;
    try {
        ({ format, width, height } = await sharp(source, { limitInputPixels }).metadata());
    } catch (error) {
        throw new ImageDecodeError(
            error instanceof Error ? error.message : "Could not read the image.",
        );
    }
    if (format === undefined || width === undefined || height === undefined) {
        throw new ImageDecodeError("Image has no readable dimensions.");
    }
    if (width > maxDimension || height > maxDimension) {
        throw new ImageDecodeError(`Image is ${width}x${height}, larger than ${maxDimension} on a side.`);
    }
    const derivatives: Derivative[] = [];
    for (const spec of specs) {
        const { data, info } = await sharp(source, { limitInputPixels })
            .rotate()
            .resize({ width: spec.width, fit: "inside", withoutEnlargement: true })
            .webp({ quality })
            .toBuffer({ resolveWithObject: true });
        derivatives.push({
            name: spec.name,
            width: info.width,
            height: info.height,
            bytes: new Uint8Array(data),
        });
    }
    return { source: { format, width, height }, derivatives };
}