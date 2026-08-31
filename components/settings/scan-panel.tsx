"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const SCAN_MODES = [
    "quick",
    "full",
    "unmatched",
    "metadata-only",
    "hashes-only",
] as const;
type ScanMode = (typeof SCAN_MODES)[number];

const MODE_HELP: Record<ScanMode, string> = {
    quick: "Find new and changed files. Skips hashing and metadata.",
    full: "Re-read, re-hash and reconsider metadata for every file.",
    unmatched: "Retry metadata for unmatched games only.",
    "metadata-only": "Refetch metadata without re-reading ROM files.",
    "hashes-only": "Compute missing hashes without contacting providers.",
};

interface ScanCounters {
    discovered: number;
    added: number;
    updated: number;
    missing: number;
    matched: number;
    unmatched: number;
    errors: number;
}

export interface ScanSummary {
    id: string;
    mode: string;
    status: string;
    platform: string | null;
    counters: ScanCounters;
    startedAt: string | null;
    completedAt: string | null;
    errorSummary: string | null;
    isRunning: boolean;
}

export interface ScanEventItem {
    id: number;
    level: "debug" | "info" | "warning" | "error";
    type: string;
    message: string;
    context: Record<string, unknown>;
    createdAt: string;
}

export interface PlatformOption {
    slug: string;
    name: string;
}

export interface ScanPanelProps {
    platforms: PlatformOption[];
    initialScan: ScanSummary | null;
    initialEvents: ScanEventItem[];
}

export function ScanPanel({
    platforms,
    initialScan,
    initialEvents,
}: ScanPanelProps) {
    const [mode, setMode] = useState<ScanMode>("quick");
    const [platform, setPlatform] = useState("");
    const [scan, setScan] = useState<ScanSummary | null>(initialScan);
    const [events, setEvents] = useState<ScanEventItem[]>(initialEvents);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cursorRef = useRef<number | null>(initialEvents.at(-1)?.id ?? null);
    const scanIdRef = useRef<string | null>(initialScan?.id ?? null);

    const loadEvents = useCallback(async (scanId: string) => {
        const url = new URL(
            `/api/scans/${scanId}/events`,
            window.location.origin,
        );
        if (cursorRef.current !== null) {
            url.searchParams.set("after", String(cursorRef.current));
        }
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as {
            events: ScanEventItem[];
            nextCursor: number | null;
        };
        if (data.events.length > 0) {
            cursorRef.current = data.nextCursor;
            setEvents((previous) => [...previous, ...data.events].slice(-200));
        }
    }, []);

    const refresh = useCallback(async () => {
        const response = await fetch("/api/scans/current", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as { scan: ScanSummary | null };
        setScan(data.scan);

        if (data.scan) {
            if (scanIdRef.current !== data.scan.id) {
                scanIdRef.current = data.scan.id;
                cursorRef.current = null;
                setEvents([]);
            }
            await loadEvents(data.scan.id);
        }
    }, [loadEvents]);

    const isRunning = scan?.isRunning ?? false;

    useEffect(() => {
        const intervalMs = isRunning ? 2000 : 15000;
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") void refresh();
        }, intervalMs);
        return () => clearInterval(timer);
    }, [isRunning, refresh]);

    async function startScan() {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch("/api/scans", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mode, ...(platform ? { platform } : {}) }),
            });

            if (!response.ok) {
                const data = (await response.json()) as {
                    error?: { message?: string };
                };
                setError(data.error?.message ?? "The scan could not be started.");
                return;
            }
            await refresh();
        } catch {
            setError("The scan could not be started.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="rounded-lg border border-line p-6">
            <h2 className="text-lg font-medium">Library scan</h2>
            <p className="mt-1 text-sm text-muted">
                {MODE_HELP[mode]}
            </p>

            <div className="mt-5 flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="scan-mode" className="text-xs text-muted">
                        Mode
                    </label>
                    <select
                        id="scan-mode"
                        value={mode}
                        onChange={(event) => setMode(event.target.value as ScanMode)}
                        className="min-w-40 rounded border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        {SCAN_MODES.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label htmlFor="scan-platform" className="text-xs text-muted">
                        Platform
                    </label>
                    <select
                        id="scan-platform"
                        value={platform}
                        onChange={(event) => setPlatform(event.target.value)}
                        className="min-w-48 rounded border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        <option value="">All platforms</option>
                        {platforms.map((option) => (
                            <option key={option.slug} value={option.slug}>
                                {option.name}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    type="button"
                    onClick={() => void startScan()}
                    disabled={busy || isRunning}
                    className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    {isRunning ? "Scanning…" : busy ? "Starting…" : "Run scan"}
                </button>
            </div>

            {error ? (
                <p role="alert" className="mt-4 text-sm text-warning">
                    {error}
                </p>
            ) : null}

            <div aria-live="polite" className="mt-6">
                {scan === null ? (
                    <p className="text-sm text-muted">
                        No scan has run yet. Add ROMs under your library&rsquo;s platform
                        folders, then run a scan.
                    </p>
                ) : (
                    <>
                        <p className="text-sm">
                            <span className="text-muted">Last scan</span>{" "}
                            <span className="font-mono text-xs">{scan.mode}</span>
                            {scan.platform ? (
                                <span className="font-mono text-xs"> · {scan.platform}</span>
                            ) : null}{" "}
                            <span className="text-muted">—</span> {scan.status.replace(/_/g, " ")}
                        </p>

                        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
                            {(
                                [
                                    ["Discovered", scan.counters.discovered],
                                    ["Added", scan.counters.added],
                                    ["Updated", scan.counters.updated],
                                    ["Missing", scan.counters.missing],
                                    ["Unmatched", scan.counters.unmatched],
                                    ["Errors", scan.counters.errors],
                                ] as const
                            ).map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-3">
                                    <dt className="text-muted">{label}</dt>
                                    <dd className="font-mono tabular-nums">{value}</dd>
                                </div>
                            ))}
                        </dl>

                        {scan.errorSummary ? (
                            <p className="mt-3 text-sm text-warning">{scan.errorSummary}</p>
                        ) : null}
                    </>
                )}
            </div>

            {events.length > 0 ? (
                <div className="mt-6">
                    <h3 className="text-sm font-medium">Scan log</h3>
                    <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
                        {events.map((event) => (
                            <li key={event.id} className="flex gap-2">
                                <span className="w-16 shrink-0 font-mono uppercase text-muted">
                                    {event.level}
                                </span>
                                <span>{event.message}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}