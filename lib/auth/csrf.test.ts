import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "./csrf.ts";

const base = {
    requestOrigin: "http://localhost:3000",
    appUrl: "http://localhost:3000",
    secFetchSite: null as string | null,
    origin: null as string | null,
};

describe("isCrossSiteWrite", () => {
    it("never blocks a safe method", () => {
        for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
            expect(isCrossSiteWrite({ ...base, method, secFetchSite: "cross-site" })).toBe(false);
        }
    });
    it("trusts Sec-Fetch-Site when the browser sends it", () => {
        expect(isCrossSiteWrite({ ...base, method: "POST", secFetchSite: "same-origin" })).toBe(false);
        expect(isCrossSiteWrite({ ...base, method: "POST", secFetchSite: "none" })).toBe(false);
        expect(isCrossSiteWrite({ ...base, method: "POST", secFetchSite: "cross-site" })).toBe(true);
        expect(isCrossSiteWrite({ ...base, method: "PATCH", secFetchSite: "same-site" })).toBe(true);
    });
    it("falls back to Origin", () => {
        expect(isCrossSiteWrite({ ...base, method: "POST", origin: "http://localhost:3000" })).toBe(false);
        expect(isCrossSiteWrite({ ...base, method: "POST", origin: "https://evil.example" })).toBe(true);
        expect(isCrossSiteWrite({ ...base, method: "POST", origin: "http://localhost:3001" })).toBe(true);
    });
    it("accepts the configured public origin behind a reverse proxy", () => {
        expect(
            isCrossSiteWrite({
                method: "POST",
                secFetchSite: null,
                origin: "https://games.example.net",
                requestOrigin: "http://10.0.0.5:3000",
                appUrl: "https://games.example.net",
            }),
        ).toBe(false);
    });
    it("allows a request with no browser headers at all", () => {
        expect(isCrossSiteWrite({ ...base, method: "POST" })).toBe(false);
        expect(isCrossSiteWrite({ ...base, method: "DELETE" })).toBe(false);
    });
    it("rejects a malformed Origin rather than ignoring it", () => {
        expect(isCrossSiteWrite({ ...base, method: "POST", origin: "not a url" })).toBe(true);
        expect(isCrossSiteWrite({ ...base, method: "POST", origin: "null" })).toBe(true);
    });
});