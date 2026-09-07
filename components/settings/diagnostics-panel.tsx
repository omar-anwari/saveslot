"use client";
import { useState } from "react";

type Status = "ok" | "warn" | "fail";

interface Check {
    name: string;
    status: Status;
    detail: string;
}

interface Report {
    status: Status;
    generatedAt: string;
    checks: Check[];
}

const CHIP: Record<Status, string> = {
    ok: "border-line text-muted",
    warn: "border-warning text-warning",
    fail: "border-warning text-warning",
};

const LABEL: Record<Status, string> = { ok: "ok", warn: "warn", fail: "fail" };

export function DiagnosticsPanel({
    appVersion,
    initialReport,
}: {
    appVersion: string;
    initialReport: Report;
}) {
    const [report, setReport] = useState<Report>(initialReport);
    const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function load() {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch("/api/doctor", { cache: "no-store" });
            const data = (await response.json()) as Report;
            setReport(data);
            setRefreshedAt(new Date().toLocaleTimeString());
        } catch {
            setError("Diagnostics could not be loaded.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <section className="mb-8 rounded-lg border border-line p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-medium">Diagnostics</h2>
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={busy}
                    className="rounded border border-line px-3 py-1.5 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
                >
                    {busy ? "Checking…" : "Re-check"}
                </button>
            </div>
            <p className="mt-2 text-xs text-muted">
                SaveSlot {appVersion}
                {refreshedAt === null ? "" : ` · re-checked ${refreshedAt}`}
                {" · same checks as "}
                <span className="font-mono">pnpm run doctor</span>
            </p>
            {error !== null ? (
                <p role="alert" className="mt-3 text-sm text-warning">
                    {error}
                </p>
            ) : null}
            {report.checks.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No checks ran.</p>
            ) : (
                <ul className="mt-4 space-y-2 text-sm">
                    {report.checks.map((check) => (
                        <li key={check.name} className="flex flex-wrap items-baseline gap-3">
                            <span
                                className={`rounded border px-2 py-0.5 text-xs ${CHIP[check.status]}`}
                            >
                                {LABEL[check.status]}
                            </span>
                            <span className="w-44 shrink-0">{check.name}</span>
                            <span className="min-w-0 flex-1 text-muted">{check.detail}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}