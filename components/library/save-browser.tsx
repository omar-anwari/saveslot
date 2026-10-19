"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DetailIcon } from "@/components/library/detail-icon";

export interface GameSaveItem {
    key: string;
    id: string;
    kind: "battery" | "autosave" | "manual";
    label: string;
    timestamp: string;
    relativeTime: string;
    byteSize: string;
    screenshotUrl: string | null;
    isCurrent: boolean;
    loadHref: string | null;
}

const KIND_LABELS = { battery: "In-game save", autosave: "Auto save", manual: "Manual save" };

export function SaveBrowser({
    slug,
    entries,
    initialSelectedKey,
    playable,
}: {
    slug: string;
    entries: GameSaveItem[];
    initialSelectedKey?: string;
    playable: boolean;
}) {
    const router = useRouter();
    const [selectedKey, setSelectedKey] = useState(initialSelectedKey ?? entries[0]?.key);
    const selected = entries.find((entry) => entry.key === selectedKey) ?? entries[0];
    const [renaming, setRenaming] = useState(false);
    const [name, setName] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function select(entry: GameSaveItem) {
        setSelectedKey(entry.key);
        setRenaming(false);
        setConfirmDelete(false);
        setError(null);
        window.history.replaceState(null, "", `/games/${slug}?tab=saves&save=${encodeURIComponent(entry.key)}`);
    }

    async function update(method: "PATCH" | "DELETE") {
        if (!selected || busy) return;
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`/api/${selected.kind === "battery" ? "saves" : "states"}/${selected.id}`, {
                method,
                ...(method === "PATCH" ? {
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ label: name.trim() }),
                } : {}),
            });
            if (!response.ok) {
                const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
                throw new Error(result.error?.message ?? "The save could not be updated. Try again.");
            }
            setRenaming(false);
            setConfirmDelete(false);
            if (method === "DELETE") {
                const next = entries.find((entry) => entry.key !== selected.key);
                setSelectedKey(next?.key);
                window.history.replaceState(null, "", `/games/${slug}?tab=saves${next ? `&save=${encodeURIComponent(next.key)}` : ""}`);
            }
            router.refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The save could not be updated. Try again.");
        } finally {
            setBusy(false);
        }
    }

    if (!selected) {
        return (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-elevated px-6 py-12 text-center">
                <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-accent-soft text-[#aa96ff]"><DetailIcon name="save" width={25} height={25} /></span>
                <h2 className="text-lg font-medium">No saves yet</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted">Play a game to create an in-game save, or capture a save state from the player menu.</p>
                {playable ? <Link href={`/player/${slug}`} className="mt-5 flex items-center gap-2 rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"><DetailIcon name="play" width={16} height={16} fill="currentColor" />Play game</Link> : null}
            </div>
        );
    }

    return (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.5fr)] xl:gap-7">
            <section className="overflow-hidden rounded-lg border border-line bg-elevated" aria-label="Saved games">
                <div className="flex items-center justify-between border-b border-line px-5 py-4">
                    <h2 className="text-sm font-medium">Your saves</h2>
                    <span className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted">{entries.length}</span>
                </div>
                <div className="max-h-[520px] space-y-1.5 overflow-y-auto p-2">
                    {entries.map((entry) => (
                        <button key={entry.key} type="button" aria-pressed={selected.key === entry.key} onClick={() => select(entry)} disabled={busy}
                            className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors disabled:opacity-50 ${selected.key === entry.key ? "border-accent/50 bg-accent-soft" : "border-transparent hover:bg-surface-hover"}`}>
                            <span className="flex aspect-[4/3] w-20 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-surface text-subtle">
                                {entry.screenshotUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={entry.screenshotUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                                ) : <DetailIcon name="save" width={24} height={24} />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{entry.label}</span>
                                <span className="mt-1 block text-[11px] text-subtle">{entry.relativeTime}</span>
                                <span className={`mt-1.5 inline-block text-[10px] font-medium ${entry.kind === "autosave" ? "text-[#b3a3ff]" : "text-muted"}`}>{KIND_LABELS[entry.kind]}{entry.isCurrent ? " · Current" : ""}</span>
                            </span>
                        </button>
                    ))}
                </div>
                {playable ? <Link href={`/player/${slug}`} className="flex items-center justify-center gap-2 border-t border-line px-4 py-4 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-ink"><DetailIcon name="plus" width={15} height={15} />Play to create a new save</Link> : null}
            </section>
            <section className="overflow-hidden rounded-lg border border-line bg-elevated" aria-label="Selected save">
                <div className="relative flex aspect-video items-center justify-center border-b border-line bg-surface">
                    {selected.screenshotUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={selected.screenshotUrl} alt={`Screenshot of ${selected.label}`} className="h-full w-full object-contain" />
                    ) : (
                        <div className="flex flex-col items-center gap-3 text-subtle"><DetailIcon name={selected.kind === "battery" ? "save" : "image"} width={40} height={40} /><span className="text-xs">No screenshot for this save</span></div>
                    )}
                    <span className="absolute bottom-4 left-4 rounded-sm border border-white/10 bg-black/60 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm">{KIND_LABELS[selected.kind]}</span>
                </div>
                <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">Selected save</p>
                            <h3 className="break-words text-xl font-medium tracking-tight">{selected.label}</h3>
                        </div>
                        <details key={selected.key} className="relative">
                            <summary aria-label="Save options" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-sm border border-line text-muted hover:bg-surface-hover [&::-webkit-details-marker]:hidden"><DetailIcon name="more" strokeWidth={3} /></summary>
                            <div className="absolute right-0 top-full z-10 mt-2 w-40 rounded-md border border-line-strong bg-surface p-1.5 shadow-xl">
                                {selected.kind !== "battery" ? <button type="button" disabled={busy} onClick={() => { setName(selected.label); setRenaming(true); setConfirmDelete(false); }} className="w-full rounded-sm px-3 py-2 text-left text-sm text-muted hover:bg-surface-hover">Rename</button> : null}
                                <button type="button" disabled={busy} onClick={() => { setConfirmDelete(true); setRenaming(false); }} className="w-full rounded-sm px-3 py-2 text-left text-sm text-danger hover:bg-surface-hover">Delete save</button>
                            </div>
                        </details>
                    </div>
                    <dl className="mt-6 grid grid-cols-2 gap-4 border-b border-line pb-6 text-sm">
                        <div><dt className="text-xs text-subtle">Saved</dt><dd className="mt-1.5 text-muted">{selected.timestamp}</dd></div>
                        <div><dt className="text-xs text-subtle">File size</dt><dd className="mt-1.5 text-muted">{selected.byteSize}</dd></div>
                    </dl>
                    {renaming ? <form className="mt-5" onSubmit={(event) => { event.preventDefault(); void update("PATCH"); }}>
                        <label htmlFor="save-name" className="mb-2 block text-xs text-muted">Save name</label>
                        <input id="save-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} autoFocus className="h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm" />
                        <div className="mt-3 flex gap-3"><button disabled={busy || !name.trim()} type="submit" className="rounded-sm bg-accent px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Saving…" : "Save name"}</button><button disabled={busy} type="button" onClick={() => setRenaming(false)} className="px-3 text-sm text-muted">Cancel</button></div>
                    </form> : null}
                    {confirmDelete ? <div className="mt-5 rounded-md border border-danger/25 bg-danger/5 p-4">
                        <p className="text-sm font-medium">Delete this save?</p><p className="mt-1 text-xs leading-5 text-muted">This save and its screenshot will be permanently removed.</p>
                        <div className="mt-3 flex gap-3"><button type="button" disabled={busy} onClick={() => void update("DELETE")} className="rounded-sm bg-danger px-3 py-2 text-xs font-medium text-bg disabled:opacity-50">{busy ? "Deleting…" : "Delete save"}</button><button disabled={busy} type="button" onClick={() => setConfirmDelete(false)} className="px-2 text-xs text-muted">Cancel</button></div>
                    </div> : null}
                    {error ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        {selected.loadHref ? <Link href={selected.loadHref} className="flex h-11 items-center gap-2 rounded-sm bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover"><DetailIcon name="play" width={15} height={15} fill="currentColor" />{selected.kind === "battery" ? "Resume game" : "Load save"}</Link> : null}
                        <a href={`/api/${selected.kind === "battery" ? "saves" : "states"}/${selected.id}/content`} download className="flex h-11 items-center gap-2 rounded-sm border border-line-strong px-4 text-sm text-muted hover:bg-surface-hover hover:text-ink"><DetailIcon name="download" width={16} height={16} />Download</a>
                    </div>
                </div>
            </section>
        </div>
    );
}
