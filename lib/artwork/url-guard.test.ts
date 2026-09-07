import { describe, expect, it } from "vitest";
import { artworkUrl } from "./url.ts";
import { UnsafeUrlError, assertAllowedUrl, isBlockedAddress } from "./url-guard.ts";


describe("isBlockedAddress", () => {
    it("blocks loopback, private and link-local IPv4", () => {
        for (const address of [
            "127.0.0.1", "127.1.2.3", "0.0.0.0", "10.0.0.5", "172.16.0.1",
            "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
            "224.0.0.1", "255.255.255.255", "198.18.0.1",
        ]) {
            expect(isBlockedAddress(address), address).toBe(true);
        }
    });
    it("allows genuinely public IPv4", () => {
        for (const address of ["1.1.1.1", "8.8.8.8", "104.16.0.1", "172.32.0.1", "192.167.255.255"]) {
            expect(isBlockedAddress(address), address).toBe(false);
        }
    });
    it("blocks loopback, link-local and unique-local IPv6", () => {
        for (const address of [
            "::1", "::", "fe80::1", "fe80::a00:27ff:fe4e:66a1", "fc00::1",
            "fd12:3456:789a::1", "ff02::1", "2001:db8::1",
        ]) {
            expect(isBlockedAddress(address), address).toBe(true);
        }
    });
    it("allows public IPv6", () => {
        for (const address of ["2606:4700:4700::1111", "2a00:1450:4009:81f::200e"]) {
            expect(isBlockedAddress(address), address).toBe(false);
        }
    });
    it("looks through an IPv4 address wrapped in IPv6", () => {
        expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
        expect(isBlockedAddress("::ffff:169.254.169.254")).toBe(true);
        expect(isBlockedAddress("::ffff:7f00:1")).toBe(true);
        expect(isBlockedAddress("64:ff9b::192.168.0.1")).toBe(true);
        expect(isBlockedAddress("::ffff:8.8.8.8")).toBe(false);
    });
    it("treats a hostname as unresolved, therefore not yet safe", () => {
        expect(isBlockedAddress("example.com")).toBe(true);
        expect(isBlockedAddress("not an address")).toBe(true);
    });
});

describe("assertAllowedUrl", () => {
    it("accepts a normal https image URL", () => {
        const url = assertAllowedUrl("https://images.igdb.com/igdb/image/upload/t_cover_big/co1uje.jpg");
        expect(url.hostname).toBe("images.igdb.com");
    });
    it("rejects every protocol but http and https", () => {
        for (const raw of [
            "file:///etc/passwd",
            "data:image/png;base64,iVBORw0KGgo=",
            "ftp://example.com/x.png",
            "gopher://example.com/",
            "javascript:alert(1)",
        ]) {
            expect(() => assertAllowedUrl(raw), raw).toThrow(UnsafeUrlError);
        }
    });
    it("rejects an address that is not a public host", () => {
        for (const raw of [
            "http://127.0.0.1/cover.png",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]:8080/cover.png",
            "http://192.168.0.1/cover.png",
            "http://[::ffff:127.0.0.1]/cover.png",
        ]) {
            expect(() => assertAllowedUrl(raw), raw).toThrow(UnsafeUrlError);
        }
    });
    it("rejects credentials in the URL", () => {
        expect(() => assertAllowedUrl("https://user:pass@images.igdb.com/x.png")).toThrow(UnsafeUrlError);
        expect(() => assertAllowedUrl("https://images.igdb.com@127.0.0.1/x.png")).toThrow(UnsafeUrlError);
    });
    it("enforces an allow list when one is given", () => {
        const allowedHosts = ["images.igdb.com"];
        expect(assertAllowedUrl("https://IMAGES.igdb.com/a.png", { allowedHosts }).pathname).toBe("/a.png");
        expect(() => assertAllowedUrl("https://evil.example/a.png", { allowedHosts })).toThrow(UnsafeUrlError);
    });
});
describe("artworkUrl", () => {
    it("builds a route URL from a stored path", () => {
        const hash = "a".repeat(64);
        expect(artworkUrl(`artwork/thumb/aa/${hash}.webp`)).toBe(`/api/artwork/thumb/${hash}.webp`);
    });
    it("returns null for anything that is not one of ours", () => {
        expect(artworkUrl(null)).toBeNull();
        expect(artworkUrl(undefined)).toBeNull();
        expect(artworkUrl("app.sqlite")).toBeNull();
        expect(artworkUrl("artwork/../app.sqlite")).toBeNull();
        expect(artworkUrl("artwork/thumb/aa/short.webp")).toBeNull();
        expect(artworkUrl(`artwork/thumb/aa/${"a".repeat(64)}.png`)).toBeNull();
    });
});