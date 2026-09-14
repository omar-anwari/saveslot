"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BrowseIcon } from "@/components/library/browse-icon";

export function FavoriteButton({ slug, title, favourite }: { slug: string; title: string; favourite: boolean }) {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [refreshing, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    async function toggle() {
        setSaving(true);
        setError(null);
        try {
            const response = await fetch(`/api/games/${slug}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ favourite: !favourite }),
            });
            if (!response.ok) throw new Error("Could not update favorite. Try again.");
            startTransition(() => router.refresh());
        } catch {
            setError("Could not update favorite. Try again.");
        } finally {
            setSaving(false);
        }
    }
    return (
        <span className="relative flex shrink-0">
            <button type="button" onClick={toggle} disabled={saving || refreshing} aria-pressed={favourite} aria-label={`${favourite ? "Remove" : "Add"} ${title} ${favourite ? "from" : "to"} favorites`} title={favourite ? "Remove from favorites" : "Add to favorites"} className={`flex h-8 w-8 items-center justify-center rounded-sm transition-colors hover:bg-surface-active disabled:opacity-40 ${favourite ? "text-accent-hover" : "text-subtle hover:text-ink"}`}>
                <BrowseIcon name="heart" width="15" height="15" fill={favourite ? "currentColor" : "none"} />
            </button>
            {error ? <span role="alert" className="absolute right-0 bottom-10 z-20 w-48 rounded-sm border border-line-strong bg-surface p-3 text-xs text-warning shadow-card">{error}</span> : null}
        </span>
    );
}
