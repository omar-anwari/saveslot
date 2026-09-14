"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DetailIcon } from "@/components/library/detail-icon";

const PLAY_STATUSES = [
    "unplayed",
    "playing",
    "completed",
    "abandoned",
    "backlog",
] as const;
type PlayStatus = (typeof PLAY_STATUSES)[number];

const STATUS_LABELS: Record<PlayStatus, string> = {
    unplayed: "Unplayed",
    playing: "Playing",
    completed: "Completed",
    abandoned: "Abandoned",
    backlog: "Backlog",
};

function isPlayStatus(value: string): value is PlayStatus {
    return (PLAY_STATUSES as readonly string[]).includes(value);
}

export interface GameActionsProps {
    slug: string;
    favourite: boolean;
    hidden: boolean;
    playStatus: string;
}

export function GameActions({
    slug,
    favourite: initialFavourite,
    hidden: initialHidden,
    playStatus: initialStatus,
}: GameActionsProps) {
    const router = useRouter();
    const [favourite, setFavourite] = useState(initialFavourite);
    const [hidden, setHidden] = useState(initialHidden);
    const [playStatus, setPlayStatus] = useState<PlayStatus>(
        isPlayStatus(initialStatus) ? initialStatus : "unplayed",
    );
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [, startTransition] = useTransition();
    async function patch(
        body: { favourite: boolean } | { hidden: boolean } | { playStatus: PlayStatus },
        revert: () => void,
    ) {
        setSaving(true);
        setError(null);
        try {
            const response = await fetch(`/api/games/${slug}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                revert();
                const data = (await response.json()) as {
                    error?: { message?: string };
                };
                setError(data.error?.message ?? "The change could not be saved.");
                return;
            }
            startTransition(() => router.refresh());
        } catch {
            revert();
            setError("The change could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    function toggleFavourite() {
        const previous = favourite;
        setFavourite(!previous);
        void patch({ favourite: !previous }, () => setFavourite(previous));
    }
    function toggleHidden() {
        const previous = hidden;
        setHidden(!previous);
        void patch({ hidden: !previous }, () => setHidden(previous));
    }
    function changeStatus(next: string) {
        if (!isPlayStatus(next)) return;
        const previous = playStatus;
        setPlayStatus(next);
        void patch({ playStatus: next }, () => setPlayStatus(previous));
    }
    return (
        <div className="relative">
            <div className="flex items-center gap-2.5">
                <button
                    type="button"
                    onClick={toggleFavourite}
                    disabled={saving}
                    aria-pressed={favourite}
                    className={
                        `flex h-11 items-center gap-2 rounded-sm border px-3.5 text-sm font-medium transition-colors disabled:opacity-50 ${favourite
                            ? "border-accent/35 bg-accent-soft text-[#b6a6ff]"
                            : "border-line-strong bg-surface/75 text-muted hover:bg-surface-hover hover:text-ink"}`
                    }
                >
                    <DetailIcon name="heart" fill={favourite ? "currentColor" : "none"} width={17} height={17} />
                    {favourite ? "Favorited" : "Favorite"}
                </button>
                <details className="group relative">
                    <summary aria-label="More game options" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-sm border border-line-strong bg-surface/75 text-muted transition-colors hover:bg-surface-hover hover:text-ink [&::-webkit-details-marker]:hidden">
                        <DetailIcon name="more" strokeWidth={3.5} />
                    </summary>
                    <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-md border border-line-strong bg-elevated p-3 shadow-xl">
                        <label htmlFor="play-status" className="mb-2 block text-xs text-muted">Play status</label>
                        <select
                            id="play-status"
                            value={playStatus}
                            disabled={saving}
                            onChange={(event) => changeStatus(event.target.value)}
                            className="h-10 w-full rounded-sm border border-line bg-surface px-2.5 text-sm disabled:opacity-50"
                        >
                            {PLAY_STATUSES.map((value) => (
                                <option key={value} value={value}>{STATUS_LABELS[value]}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={toggleHidden}
                            disabled={saving}
                            aria-pressed={hidden}
                            title="Hidden games keep their saves and metadata but are left out of the library listing"
                            className="mt-3 w-full rounded-sm border border-line px-3 py-2.5 text-left text-sm text-muted hover:bg-surface-hover disabled:opacity-50"
                        >
                            {hidden ? "Show in library" : "Hide from library"}
                        </button>
                    </div>
                </details>
            </div>
            {error ? (
                <p role="alert" className="mt-3 text-sm text-warning">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
