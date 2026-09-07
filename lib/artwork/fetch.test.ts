import { describe, expect, it, vi } from "vitest";
import { fetchImage } from "./fetch.ts";
import { UnsafeUrlError } from "./url-guard.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const IGDB = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1uje.jpg";

const publicDns = async () => [{ address: "104.16.0.1" }];

function body(bytes: Uint8Array): ArrayBuffer {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
}

function imageResponse(bytes: Uint8Array, headers: Record<string, string> = {}) {
    return new Response(body(bytes), { status: 200, headers: { "content-type": "image/png", ...headers } });
}

function redirectTo(location: string, status = 302) {
    return new Response(null, { status, headers: { location } });
}

function streamed(chunkSize: number, chunks: number) {
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(PNG);
            for (let index = 0; index < chunks; index += 1) {
                controller.enqueue(new Uint8Array(chunkSize));
            }
            controller.close();
        },
    });
    return new Response(stream, { status: 200 });
}

describe("fetchImage", () => {
    it("fetches and identifies an image", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(imageResponse(PNG));
        const result = await fetchImage(IGDB, { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: publicDns });
        expect(result.format).toBe("png");
        expect(result.contentType).toBe("image/png");
        expect(result.finalUrl).toBe(IGDB);
        expect(result.bytes).toEqual(PNG);
    });
    it("trusts the bytes, not the Content-Type", async () => {
        const html = new TextEncoder().encode("<!DOCTYPE html><html>nope</html>");
        const fetchImpl = vi.fn().mockResolvedValue(imageResponse(html));
        await expect(
            fetchImage(IGDB, { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: publicDns }),
        ).rejects.toMatchObject({ code: "not-an-image" });
    });
    it("refuses a host that resolves to a private address", async () => {
        const fetchImpl = vi.fn();
        await expect(
            fetchImage("https://sneaky.example/cover.png", {
                fetchImpl: fetchImpl as unknown as typeof fetch,
                lookupImpl: async () => [{ address: "10.0.0.5" }],
            }),
        ).rejects.toBeInstanceOf(UnsafeUrlError);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
    it("refuses when only one of several answers is private", async () => {
        await expect(
            fetchImage("https://sneaky.example/cover.png", {
                fetchImpl: vi.fn() as unknown as typeof fetch,
                lookupImpl: async () => [{ address: "8.8.8.8" }, { address: "127.0.0.1" }],
            }),
        ).rejects.toBeInstanceOf(UnsafeUrlError);
    });
    it("refuses when the name will not resolve", async () => {
        await expect(
            fetchImage("https://nowhere.example/cover.png", {
                fetchImpl: vi.fn() as unknown as typeof fetch,
                lookupImpl: async () => { throw new Error("ENOTFOUND"); },
            }),
        ).rejects.toBeInstanceOf(UnsafeUrlError);
    });
    it("re-checks every redirect hop", async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(redirectTo("http://169.254.169.254/latest/meta-data/"))
            .mockResolvedValue(imageResponse(PNG));

        await expect(
            fetchImage(IGDB, { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: publicDns }),
        ).rejects.toBeInstanceOf(UnsafeUrlError);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
    it("refuses a redirect that changes protocol", async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(redirectTo("file:///etc/passwd"));
        await expect(
            fetchImage(IGDB, { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: publicDns }),
        ).rejects.toBeInstanceOf(UnsafeUrlError);
    });
    it("follows a redirect it is happy with", async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(redirectTo("/igdb/image/upload/t_cover_big/other.jpg"))
            .mockResolvedValueOnce(imageResponse(PNG));
        const result = await fetchImage(IGDB, {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            lookupImpl: publicDns,
        });
        expect(result.finalUrl).toContain("other.jpg");
    });

    it("gives up after too many redirects", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(redirectTo(IGDB));
        await expect(
            fetchImage(IGDB, {
                fetchImpl: fetchImpl as unknown as typeof fetch,
                lookupImpl: publicDns,
                maxRedirects: 2,
            }),
        ).rejects.toMatchObject({ code: "too-many-redirects" });
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });
    it("rejects a redirect with no Location", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
        await expect(
            fetchImage(IGDB, { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: publicDns }),
        ).rejects.toMatchObject({ code: "no-location" });
    });
    it("rejects an oversized declared length without reading the body", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            imageResponse(PNG, { "content-length": "99999999" }),
        );
        await expect(
            fetchImage(IGDB, {
                fetchImpl: fetchImpl as unknown as typeof fetch,
                lookupImpl: publicDns,
                maxBytes: 1024,
            }),
        ).rejects.toMatchObject({ code: "too-large" });
    });
    it("stops a body that lies about its length", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(streamed(1024, 20));
        await expect(
            fetchImage(IGDB, {
                fetchImpl: fetchImpl as unknown as typeof fetch,
                lookupImpl: publicDns,
                maxBytes: 4096,
            }),
        ).rejects.toMatchObject({ code: "too-large" });
    });
    it("surfaces an HTTP error", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response("gone", { status: 404 }));
        await expect(
            fetchImage(IGDB, { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: publicDns }),
        ).rejects.toMatchObject({ code: "http-error" });
    });
    it("honours an allow list", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(imageResponse(PNG));
        await expect(
            fetchImage("https://elsewhere.example/a.png", {
                fetchImpl: fetchImpl as unknown as typeof fetch,
                lookupImpl: publicDns,
                allowedHosts: ["images.igdb.com"],
            }),
        ).rejects.toBeInstanceOf(UnsafeUrlError);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});