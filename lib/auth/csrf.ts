export const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfInput {
    method: string;
    secFetchSite: string | null;
    origin: string | null;
    requestOrigin: string;
    appUrl?: string;
}

function originsFor(input: CsrfInput): Set<string> {
    const origins = new Set([input.requestOrigin]);
    if (input.appUrl !== undefined && URL.canParse(input.appUrl)) {
        origins.add(new URL(input.appUrl).origin);
    }
    return origins;
}

export function isCrossSiteWrite(input: CsrfInput): boolean {
    if (SAFE_METHODS.has(input.method.toUpperCase())) return false;
    if (input.secFetchSite !== null) {
        return input.secFetchSite !== "same-origin" && input.secFetchSite !== "none";
    }
    if (input.origin === null) return false;
    if (!URL.canParse(input.origin)) return true;
    return !originsFor(input).has(new URL(input.origin).origin);
}