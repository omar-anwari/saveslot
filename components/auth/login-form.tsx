"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
    const router = useRouter();
    const params = useSearchParams();
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ password }),
            });
            if (!response.ok) {
                const data = (await response.json().catch(() => ({}))) as {
                    error?: { message?: string };
                };
                setError(data.error?.message ?? "Sign in failed.");
                return;
            }
            const next = params.get("next");
            window.location.assign(next !== null && next.startsWith("/") ? next : "/");
        } catch {
            setError("Sign in failed.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <label htmlFor="password" className="text-xs text-muted">
                Password
            </label>
            <input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded border border-line bg-surface px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
            />
            <button
                type="submit"
                disabled={busy || password.length === 0}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                {busy ? "Signing in…" : "Sign in"}
            </button>
            {error ? (
                <p role="alert" className="text-sm text-warning">
                    {error}
                </p>
            ) : null}
        </form>
    );
}