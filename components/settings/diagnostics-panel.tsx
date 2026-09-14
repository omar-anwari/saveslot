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
    ok: "border-success/20 bg-success/10 text-success",
    warn: "border-warning/20 bg-warning/10 text-warning",
    fail: "border-danger/20 bg-danger/10 text-danger",
};

const LABEL: Record<Status, string> = { ok: "Healthy", warn: "Review", fail: "Issue" };

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
            if (!response.ok) throw new Error("Diagnostics request failed");
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
        <section className="rounded-lg border border-line bg-surface p-5 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">System health</h2>
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={busy}
                    className="button-secondary disabled:opacity-50"
                >
                    {busy ? "Checking…" : "Run checks"}
                </button>
            </div>
            <p className="mt-2 text-xs text-muted">
                SaveSlot {appVersion}
                {refreshedAt === null ? "" : ` · re-checked ${refreshedAt}`}
                {" · Library, storage, and player availability"}
            </p>
            {error !== null ? (
                <p role="alert" className="mt-3 text-sm text-warning">
                    {error}
                </p>
            ) : null}
            {report.checks.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No checks ran.</p>
            ) : (
                <ul className="mt-5 divide-y divide-line text-sm">
                    {report.checks.map((check) => (
                        <li key={check.name} className="flex flex-wrap items-baseline gap-3 py-4">
                            <span
                                className={`w-16 shrink-0 rounded-full border px-2 py-0.5 text-center text-xs ${CHIP[check.status]}`}
                            >
                                {LABEL[check.status]}
                            </span>
                            <span className="w-44 shrink-0">{check.name}</span>
                            <span className="min-w-0 basis-full break-words text-xs leading-5 text-muted lg:flex-1">{check.detail}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
