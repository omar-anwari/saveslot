"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
    playStatus: string;
}

export function GameActions({
    slug,
    favourite: initialFavourite,
    playStatus: initialStatus,
}: GameActionsProps) {
    const router = useRouter();
    const [favourite, setFavourite] = useState(initialFavourite);
    const [playStatus, setPlayStatus] = useState<PlayStatus>(
        isPlayStatus(initialStatus) ? initialStatus : "unplayed",
    );
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [, startTransition] = useTransition();
    async function patch(
        body: { favourite: boolean } | { playStatus: PlayStatus },
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
    function changeStatus(next: string) {
        if (!isPlayStatus(next)) return;
        const previous = playStatus;
        setPlayStatus(next);
        void patch({ playStatus: next }, () => setPlayStatus(previous));
    }
    return (
        <div className="mt-5">
            <div className="flex flex-wrap items-end gap-3">
                <button
                    type="button"
                    onClick={toggleFavourite}
                    disabled={saving}
                    aria-pressed={favourite}
                    className={
                        favourite
                            ? "rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            : "rounded border border-line px-4 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    }
                >
                    {favourite ? "★ Favourited" : "☆ Favourite"}
                </button>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="play-status" className="text-xs text-muted">
                        Status
                    </label>
                    <select
                        id="play-status"
                        value={playStatus}
                        disabled={saving}
                        onChange={(event) => changeStatus(event.target.value)}
                        className="min-w-40 rounded border border-line bg-surface px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        {PLAY_STATUSES.map((value) => (
                            <option key={value} value={value}>
                                {STATUS_LABELS[value]}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            {error ? (
                <p role="alert" className="mt-3 text-sm text-warning">
                    {error}
                </p>
            ) : null}
        </div>
    );
}