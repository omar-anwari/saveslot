"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export interface EditorCandidate {
    providerKey: string;
    providerGameId: string;
    title: string;
    score: number;
    matchType: string;
    platformSlug: string | null;
    isSelected: boolean;
    reasons: { code: string; delta: number; detail: string }[];
    externalIds: { source: string; id: string; url: string | null }[];
}

export interface MetadataEditorProps {
    slug: string;
    filenameTitle: string;
    locks: Record<string, boolean>;
    candidates: EditorCandidate[];
    values: {
        title: string;
        summary: string;
        releaseYear: string;
        developer: string;
        publisher: string;
        genres: string;
        players: string;
        region: string;
    };
}

type Field = keyof MetadataEditorProps["values"];

const LABELS: Record<Field, string> = {
    title: "Title",
    summary: "Summary",
    releaseYear: "Release year",
    developer: "Developer",
    publisher: "Publisher",
    genres: "Genres",
    players: "Players",
    region: "Region",
};

function toPayload(field: Field, value: string): unknown {
    const trimmed = value.trim();
    if (field === "genres") {
        return trimmed.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    }
    if (field === "releaseYear" || field === "players") {
        if (trimmed === "") return null;
        const parsed = Number.parseInt(trimmed, 10);
        return Number.isInteger(parsed) ? parsed : null;
    }
    return trimmed === "" ? null : trimmed;
}

export function MetadataEditor({
    slug,
    filenameTitle,
    locks,
    candidates,
    values: initial,
}: MetadataEditorProps) {
    const router = useRouter();
    const [values, setValues] = useState(initial);
    const signature = JSON.stringify(initial);
    const [applied, setApplied] = useState(signature);
    if (applied !== signature) {
        setApplied(signature);
        setValues(initial);
    }
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [, startTransition] = useTransition();
    async function send(url: string, method: string, body: unknown, success: string) {
        setBusy(true);
        setError(null);
        setNote(null);
        try {
            const response = await fetch(url, {
                method,
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const data = (await response.json().catch(() => ({}))) as {
                    error?: { message?: string; details?: { issues?: string } };
                };
                setError(data.error?.details?.issues ?? data.error?.message ?? "That could not be saved.");
                return;
            }
            setNote(success);
            startTransition(() => router.refresh());
        } catch {
            setError("That could not be saved.");
        } finally {
            setBusy(false);
        }
    }
    function save() {
        const set: Record<string, unknown> = {};
        for (const field of Object.keys(values) as Field[]) {
            if (values[field] === initial[field]) continue;
            if (field === "title" && values.title.trim() === "") continue;
            set[field] = toPayload(field, values[field]);
        }
        if (Object.keys(set).length === 0) {
            setNote("Nothing changed.");
            return;
        }
        void send(`/api/games/${slug}/metadata`, "PATCH", { set }, "Saved and locked.");
    }
    function revert(field: Field) {
        void send(`/api/games/${slug}/metadata`, "PATCH", { revert: [field] }, `${LABELS[field]} reverted.`);
    }
    function choose(candidate: EditorCandidate) {
        void send(
            `/api/games/${slug}/metadata/select`,
            "POST",
            { providerKey: candidate.providerKey, providerGameId: candidate.providerGameId },
            `Now using ${candidate.title}.`,
        );
    }
    function field(name: Field, multiline = false) {
        const locked = locks[name] === true;
        const id = `metadata-${name}`;
        return (
            <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor={id} className="text-xs text-muted">
                        {LABELS[name]}
                        {locked ? " · edited by you" : ""}
                    </label>
                    {locked ? (
                        <button
                            type="button"
                            onClick={() => revert(name)}
                            disabled={busy}
                            className="text-xs underline underline-offset-2 disabled:opacity-50"
                        >
                            Revert
                        </button>
                    ) : null}
                </div>
                {multiline ? (
                    <textarea
                        id={id}
                        rows={4}
                        value={values[name]}
                        disabled={busy}
                        onChange={(event) => setValues({ ...values, [name]: event.target.value })}
                        className="rounded border border-line bg-surface px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
                    />
                ) : (
                    <input
                        id={id}
                        type="text"
                        value={values[name]}
                        disabled={busy}
                        onChange={(event) => setValues({ ...values, [name]: event.target.value })}
                        className="rounded border border-line bg-surface px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
                    />
                )}
            </div>
        );
    }
    return (
        <details className="mt-6 rounded-lg border border-line p-6">
            <summary className="cursor-pointer text-lg font-medium">Edit metadata</summary>
            <p className="mt-3 text-sm text-muted">
                A field you change here is locked and will not be overwritten by a
                provider. Reverting a field unlocks it. The filename is always kept:{" "}
                <span className="font-mono text-xs">{filenameTitle}</span>
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {field("title")}
                {field("releaseYear")}
                {field("developer")}
                {field("publisher")}
                {field("genres")}
                {field("players")}
                {field("region")}
            </div>
            <div className="mt-4">{field("summary", true)}</div>
            <div className="mt-5 flex items-center gap-3">
                <button
                    type="button"
                    onClick={save}
                    disabled={busy}
                    className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    Save changes
                </button>
                <span className="text-xs text-muted">Genres are comma separated.</span>
            </div>
            {error ? (
                <p role="alert" className="mt-3 whitespace-pre-wrap text-sm text-warning">
                    {error}
                </p>
            ) : null}
            {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
            {candidates.length > 0 ? (
                <div className="mt-8">
                    <h3 className="text-sm font-medium text-muted">Candidates</h3>
                    <div className="mt-3 space-y-3">
                        {candidates.map((candidate) => (
                            <div
                                key={`${candidate.providerKey}:${candidate.providerGameId}`}
                                className="rounded-md border border-line p-4"
                            >
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                    <span className="text-sm font-medium">{candidate.title}</span>
                                    <span className="text-xs text-muted">
                                        {candidate.providerKey} · {candidate.matchType} match ·{" "}
                                        {Math.round(candidate.score * 100)}%
                                    </span>
                                    {candidate.isSelected ? (
                                        <span className="rounded border border-line px-2 py-0.5 text-xs">
                                            Applied
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => choose(candidate)}
                                            disabled={busy}
                                            className="rounded border border-line px-2 py-0.5 text-xs disabled:opacity-50"
                                        >
                                            Use this
                                        </button>
                                    )}
                                </div>
                                {candidate.reasons.length > 0 ? (
                                    <ul className="mt-2 space-y-1 text-xs text-muted">
                                        {candidate.reasons.map((reason) => (
                                            <li key={reason.code}>
                                                <span className="font-mono">{reason.code}</span>{" "}
                                                {reason.delta >= 0 ? "+" : ""}
                                                {reason.delta.toFixed(2)} — {reason.detail}
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                                {candidate.externalIds.length > 0 ? (
                                    <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                        {candidate.externalIds.map((external) =>
                                            external.url === null ? (
                                                <span key={external.source} className="text-muted">
                                                    {external.source}
                                                </span>
                                            ) : (
                                                <a
                                                    key={external.source}
                                                    href={external.url}
                                                    target="_blank"
                                                    rel="noreferrer noopener"
                                                    className="underline underline-offset-2"
                                                >
                                                    {external.source}
                                                </a>
                                            ),
                                        )}
                                    </p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </details>
    );
}