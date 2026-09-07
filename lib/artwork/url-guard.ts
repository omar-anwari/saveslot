import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
    readonly url: string;

    constructor(message: string, url: string) {
        super(message);
        this.name = "UnsafeUrlError";
        this.url = url;
    }
}

function parseIPv4(address: string): number | null {
    const parts = address.split(".");
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null;
        const octet = Number(part);
        if (octet > 255) return null;
        value = value * 256 + octet;
    }
    return value;
}

const BLOCKED_V4: readonly (readonly [string, number])[] = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
];

function blockedV4(value: number): boolean {
    for (const [base, prefix] of BLOCKED_V4) {
        const baseValue = parseIPv4(base);
        if (baseValue === null) continue;
        const shift = 32 - prefix;
        if (value >>> shift === baseValue >>> shift) return true;
    }
    return false;
}

function parseIPv6(address: string): number[] | null {
    let value = address.toLowerCase();
    const zone = value.indexOf("%");
    if (zone !== -1) value = value.slice(0, zone);
    const lastColon = value.lastIndexOf(":");
    if (lastColon !== -1 && value.slice(lastColon + 1).includes(".")) {
        const embedded = parseIPv4(value.slice(lastColon + 1));
        if (embedded === null) return null;
        const high = ((embedded / 65536) | 0).toString(16);
        const low = (embedded % 65536).toString(16);
        value = `${value.slice(0, lastColon + 1)}${high}:${low}`;
    }
    const halves = value.split("::");
    if (halves.length > 2) return null;
    const head = halves[0] === undefined || halves[0] === "" ? [] : halves[0].split(":");
    const tail = halves[1] === undefined || halves[1] === "" ? [] : halves[1].split(":");
    const groups: string[] =
        halves.length === 2
            ? [...head, ...Array<string>(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail]
            : head;
    if (groups.length !== 8) return null;
    const parsed: number[] = [];
    for (const group of groups) {
        if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
        parsed.push(Number.parseInt(group, 16));
    }
    return parsed;
}

function blockedV6(groups: number[]): boolean {
    const [a, b, c, d, e, f, g, h] = groups as [number, number, number, number, number, number, number, number];
    if (groups.every((group) => group === 0)) return true;                    // ::
    if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && g === 0 && h === 1) return true; // ::1
    if ((a & 0xffc0) === 0xfe80) return true;                                 // fe80::/10 link-local
    if ((a & 0xfe00) === 0xfc00) return true;                                 // fc00::/7 unique local
    if ((a & 0xff00) === 0xff00) return true;                                 // ff00::/8 multicast
    if (a === 0x2001 && b === 0x0db8) return true;                            // documentation
    const mapped = a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff;
    const nat64 = a === 0x0064 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0;
    if (mapped || nat64) return blockedV4(g * 65536 + h);
    return false;
}

export function isBlockedAddress(address: string): boolean {
    const version = isIP(address);
    if (version === 4) {
        const value = parseIPv4(address);
        return value === null ? true : blockedV4(value);
    }
    if (version === 6) {
        const groups = parseIPv6(address);
        return groups === null ? true : blockedV6(groups);
    }
    return true;
}

export interface UrlGuardOptions {
    allowedHosts?: readonly string[];
}

export function assertAllowedUrl(raw: string, options: UrlGuardOptions = {}): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new UnsafeUrlError("Not a valid URL.", raw);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new UnsafeUrlError(`Protocol ${url.protocol} is not allowed.`, raw);
    }
    if (url.username !== "" || url.password !== "") {
        throw new UnsafeUrlError("URLs with credentials are not allowed.", raw);
    }
    if (url.hostname === "") {
        throw new UnsafeUrlError("URL has no host.", raw);
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(hostname) !== 0 && isBlockedAddress(hostname)) {
        throw new UnsafeUrlError(`Address ${hostname} is not a public host.`, raw);
    }
    if (options.allowedHosts !== undefined) {
        const allowed = options.allowedHosts.some(
            (host) => host.toLowerCase() === url.hostname.toLowerCase(),
        );
        if (!allowed) throw new UnsafeUrlError(`Host ${url.hostname} is not on the allow list.`, raw);
    }
    return url;
}