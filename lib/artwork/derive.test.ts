import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { sniffImageFormat } from "./image-type.ts";
import { COVER_DERIVATIVES, ImageDecodeError, deriveCoverImages } from "./derive.ts";

async function sourceImage(width: number, height: number, format: "png" | "jpeg" = "png") {
    const pipeline = sharp({
        create: { width, height, channels: 3, background: { r: 40, g: 60, b: 120 } },
    });
    const buffer = await (format === "png" ? pipeline.png() : pipeline.jpeg()).toBuffer();
    return new Uint8Array(buffer);
}

describe("deriveCoverImages", () => {
    it("produces a thumbnail and a detail image as WebP", async () => {
        const result = await deriveCoverImages(await sourceImage(1534, 2046));
        expect(result.source).toMatchObject({ format: "png", width: 1534, height: 2046 });
        expect(result.derivatives.map((entry) => entry.name)).toEqual(["thumb", "cover"]);
        for (const derivative of result.derivatives) {
            expect(sniffImageFormat(derivative.bytes)).toBe("webp");
            expect(derivative.bytes.byteLength).toBeGreaterThan(0);
        }
    });
    it("preserves the aspect ratio", async () => {
        const result = await deriveCoverImages(await sourceImage(1534, 2046));
        for (const derivative of result.derivatives) {
            const spec = COVER_DERIVATIVES.find((entry) => entry.name === derivative.name);
            expect(derivative.width).toBe(spec?.width);
            const expected = Math.round((derivative.width * 2046) / 1534);
            expect(Math.abs(derivative.height - expected)).toBeLessThanOrEqual(1);
        }
    });
    it("never enlarges a small source", async () => {
        const result = await deriveCoverImages(await sourceImage(120, 160));
        for (const derivative of result.derivatives) {
            expect(derivative.width).toBe(120);
            expect(derivative.height).toBe(160);
        }
    });
    it("is smaller than the source it came from", async () => {
        const source = await sourceImage(1534, 2046);
        const result = await deriveCoverImages(source);
        for (const derivative of result.derivatives) {
            expect(derivative.bytes.byteLength).toBeLessThan(source.byteLength);
        }
    });
    it("carries no metadata into the output", async () => {
        const result = await deriveCoverImages(await sourceImage(600, 800, "jpeg"));
        const first = result.derivatives[0];
        const metadata = await sharp(Buffer.from(first!.bytes)).metadata();
        expect(metadata.exif).toBeUndefined();
        expect(metadata.icc).toBeUndefined();
    });
    it("refuses bytes that are not an image", async () => {
        const html = new TextEncoder().encode("<!DOCTYPE html><html></html>");
        await expect(deriveCoverImages(html)).rejects.toBeInstanceOf(ImageDecodeError);
    });
    it("refuses an image that decodes to too many pixels", async () => {
        await expect(
            deriveCoverImages(await sourceImage(1000, 1000), { maxInputPixels: 1000 }),
        ).rejects.toBeInstanceOf(ImageDecodeError);
    });
    it("refuses an absurdly long image", async () => {
        await expect(
            deriveCoverImages(await sourceImage(4000, 100), { maxDimension: 1000 }),
        ).rejects.toBeInstanceOf(ImageDecodeError);
    });
});