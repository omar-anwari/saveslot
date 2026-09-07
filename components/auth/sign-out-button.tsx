"use client";
import { useState } from "react";

export function SignOutButton() {
    const [busy, setBusy] = useState(false);

    async function signOut() {
        setBusy(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            window.location.assign("/login");
        }
    }

    return (
        <button
            type="button"
            onClick={() => void signOut()}
            disabled={busy}
            className="ml-auto text-sm text-muted outline-offset-4 transition-colors hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
        >
            Sign out
        </button>
    );
}