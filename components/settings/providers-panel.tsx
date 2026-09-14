"use client";
import { useState } from "react";

interface ProviderHealth {
    role: "identifier" | "enricher";
    key: string | null;
    configured: boolean;
    ok: boolean;
    latencyMs: number | null;
    message: string;
}

const ROLE_LABEL: Record<ProviderHealth["role"], string> = {
    identifier: "Identify — matches ROM checksums against signature databases",
    enricher: "Describe — titles, summaries, genres and cover art",
};

export function ProvidersPanel() {
    const [providers, setProviders] = useState<ProviderHealth[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    async function test() {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch("/api/metadata/health", { cache: "no-store" });
            if (!response.ok) {
                setError("The providers could not be tested.");
                return;
            }
            const data = (await response.json()) as { providers: ProviderHealth[] };
            setProviders(data.providers);
        } catch {
            setError("The providers could not be tested.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <section className="rounded-lg border border-line bg-surface p-5 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">Metadata providers</h2>
                <button
                    type="button"
                    onClick={() => void test()}
                    disabled={busy}
                    className="button-secondary disabled:opacity-50"
                >
                    {busy ? "Testing…" : "Test providers"}
                </button>
            </div>
            <p className="mt-2 text-xs text-muted">
                Credentials are read from <span className="font-mono">.env.local</span> and are
                never shown here. Testing contacts each provider and can take up to 30 seconds.
            </p>
            {error !== null ? (
                <p role="alert" className="mt-3 text-sm text-warning">
                    {error}
                </p>
            ) : null}
            {providers === null ? (
                <p className="mt-4 text-sm text-muted">Not tested yet.</p>
            ) : (
                <ul className="mt-5 grid gap-4 text-sm md:grid-cols-2">
                    {providers.map((provider) => (
                        <li key={provider.role} className="rounded-md border border-line bg-elevated p-5">
                            <div className="flex flex-wrap items-baseline gap-3">
                                <span className="font-medium">{provider.key ?? "none"}</span>
                                <span
                                    className={`rounded border px-2 py-0.5 text-xs ${provider.configured && provider.ok
                                        ? "border-success/20 bg-success/10 text-success"
                                        : "border-warning/20 bg-warning/10 text-warning"
                                        }`}
                                >
                                    {!provider.configured ? "not configured" : provider.ok ? "ok" : "failing"}
                                </span>
                                {provider.latencyMs === null ? null : (
                                    <span className="text-xs text-muted">
                                        {(provider.latencyMs / 1000).toFixed(1)}s
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-xs text-muted">{ROLE_LABEL[provider.role]}</p>
                            <p className="mt-1 text-xs text-muted">{provider.message}</p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
