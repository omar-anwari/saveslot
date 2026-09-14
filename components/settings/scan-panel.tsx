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

const MODE_LABEL: Record<ScanMode, string> = {
    quick: "Quick scan",
    full: "Full scan",
    unmatched: "Find unmatched games",
    "metadata-only": "Refresh metadata",
    "hashes-only": "Verify files",
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
    progress: { phase: string; done: number; total: number } | null;
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
    async function startMetadata() {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch("/api/scans", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    mode: "metadata-only",
                    ...(platform ? { platform } : {}),
                }),
            });
            if (!response.ok) {
                const data = (await response.json()) as { error?: { message?: string } };
                setError(data.error?.message ?? "The metadata pass could not be started.");
                return;
            }
            await refresh();
        } catch {
            setError("The metadata pass could not be started.");
        } finally {
            setBusy(false);
        }
    }
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
        <section className="rounded-lg border border-line bg-surface p-5 sm:p-7">
            <h2 className="text-lg font-semibold">Library scan</h2>
            <p className="mt-1 text-sm text-muted">
                {MODE_HELP[mode]}
            </p>
            <div className="mt-5 flex flex-wrap items-end gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-none">
                    <label htmlFor="scan-mode" className="text-xs text-muted">
                        Mode
                    </label>
                    <select
                        id="scan-mode"
                        value={mode}
                        onChange={(event) => setMode(event.target.value as ScanMode)}
                        className="min-h-11 w-full min-w-40 rounded-sm border border-line-strong bg-elevated px-3 py-2 text-sm"
                    >
                        {SCAN_MODES.map((value) => (
                            <option key={value} value={value}>
                                {MODE_LABEL[value]}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-none">
                    <label htmlFor="scan-platform" className="text-xs text-muted">
                        System
                    </label>
                    <select
                        id="scan-platform"
                        value={platform}
                        onChange={(event) => setPlatform(event.target.value)}
                        className="min-h-11 w-full min-w-48 rounded-sm border border-line-strong bg-elevated px-3 py-2 text-sm"
                    >
                        <option value="">All systems</option>
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
                    className="button-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isRunning ? "Scanning…" : busy ? "Starting…" : "Run scan"}
                </button>
                <button
                    type="button"
                    onClick={() => void startMetadata()}
                    disabled={busy || isRunning}
                    className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    title="Match hashes against providers, then fetch titles and cover art"
                >
                    Match metadata
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
                        {scan.progress === null ? null : (
                            <div className="mt-3">
                                <div
                                    role="progressbar"
                                    aria-valuemin={0}
                                    aria-valuemax={scan.progress.total}
                                    aria-valuenow={scan.progress.done}
                                    aria-label={`Scan ${scan.progress.phase}`}
                                    className="h-2 w-full overflow-hidden rounded border border-line bg-surface"
                                >
                                    <div
                                        className="h-full bg-accent transition-[width] duration-300"
                                        style={{
                                            width: `${scan.progress.total > 0
                                                ? Math.min(
                                                    100,
                                                    Math.round(
                                                        (scan.progress.done / scan.progress.total) * 100,
                                                    ),
                                                )
                                                : 100
                                                }%`,
                                        }}
                                    />
                                </div>
                                <p className="mt-1 text-xs text-muted tabular-nums">
                                    {scan.progress.phase} — {scan.progress.done} of{" "}
                                    {scan.progress.total}
                                </p>
                            </div>
                        )}
                        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
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
                                <div key={label} className="rounded-md border border-line bg-elevated p-4">
                                    <dt className="text-xs text-muted">{label}</dt>
                                    <dd className="mt-2 text-xl font-medium tabular-nums">{value}</dd>
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
                <details className="mt-6 border-t border-line pt-5">
                    <summary className="cursor-pointer text-sm font-medium text-muted hover:text-ink">Scan activity <span className="text-subtle">({events.length})</span></summary>
                    <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-md bg-elevated p-4 text-xs">
                        {events.map((event) => (
                            <li key={event.id} className="flex gap-2">
                                <span className="w-16 shrink-0 font-mono uppercase text-muted">
                                    {event.level}
                                </span>
                                <span className="min-w-0 break-words">{event.message}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </section>
    );
}
