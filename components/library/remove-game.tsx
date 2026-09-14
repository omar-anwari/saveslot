"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RemoveGame({
    slug,
    presentFiles,
    saves,
    states,
}: {
    slug: string;
    presentFiles: number;
    saves: number;
    states: number;
}) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const blocked = presentFiles > 0;
    const losing = [
        saves > 0 ? `${saves} save${saves === 1 ? "" : "s"}` : null,
        states > 0 ? `${states} state${states === 1 ? "" : "s"}` : null,
    ].filter((entry) => entry !== null);
    async function remove() {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`/api/games/${slug}?force=true`, { method: "DELETE" });
            if (!response.ok) {
                const data = (await response.json().catch(() => ({}))) as {
                    error?: { message?: string };
                };
                setError(data.error?.message ?? "It could not be removed.");
                return;
            }
            router.push("/library");
            router.refresh();
        } catch {
            setError("It could not be removed.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <section className="mt-6 max-w-3xl rounded-md border border-line p-6">
            <h2 className="text-lg font-medium">Remove from library</h2>
            {blocked ? (
                <p className="mt-2 text-sm text-muted">
                    This game&apos;s file is still on disk, so a scan would add it straight back.
                    Use <strong className="font-medium">Hide</strong> to keep it out of your
                    library, or move the file out of the ROM directory first.
                </p>
            ) : (
                <>
                    <p className="mt-2 text-sm text-muted">
                        No file is present, so this is a leftover catalogue entry. The ROM
                        directory is never modified.
                        {losing.length > 0 ? ` Removing it also deletes ${losing.join(" and ")}.` : ""}
                    </p>
                    {confirming ? (
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => void remove()}
                                disabled={busy}
                                className="rounded-sm bg-danger px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
                            >
                                {busy ? "Removing…" : "Yes, remove it"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirming(false)}
                                disabled={busy}
                                className="text-sm text-muted underline underline-offset-2"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setConfirming(true)}
                            className="mt-4 rounded-sm border border-line px-4 py-2 text-sm font-medium text-danger hover:bg-surface-hover"
                        >
                            Remove from library
                        </button>
                    )}
                </>
            )}
            {error === null ? null : (
                <p role="alert" className="mt-3 text-sm text-warning">
                    {error}
                </p>
            )}
        </section>
    );
}