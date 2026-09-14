"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

export function SettingsTabs({ tabs, initialTab }: {
    tabs: { id: string; label: string; content: ReactNode }[];
    initialTab: string;
}) {
    const [active, setActive] = useState(initialTab);

    function select(id: string) {
        setActive(id);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", id);
        window.history.replaceState(null, "", url);
    }

    function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        const target = tabs[next];
        if (target === undefined) return;
        select(target.id);
        document.getElementById(`settings-tab-${target.id}`)?.focus();
    }

    return (
        <>
            <div role="tablist" aria-label="Settings" className="mb-8 flex gap-6 overflow-x-auto border-b border-line sm:gap-8">
                {tabs.map((tab, index) => (
                    <button key={tab.id} id={`settings-tab-${tab.id}`} type="button" role="tab"
                        aria-selected={active === tab.id} aria-controls={`settings-panel-${tab.id}`}
                        tabIndex={active === tab.id ? 0 : -1} onClick={() => select(tab.id)} onKeyDown={(event) => onKey(event, index)}
                        className={`shrink-0 border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${active === tab.id ? "border-accent text-accent-hover" : "border-transparent text-muted hover:text-ink"}`}>
                        {tab.label}
                    </button>
                ))}
            </div>
            {tabs.map((tab) => (
                <div key={tab.id} id={`settings-panel-${tab.id}`} role="tabpanel" aria-labelledby={`settings-tab-${tab.id}`}
                    tabIndex={0} hidden={active !== tab.id} className="space-y-6 focus-visible:outline-none">
                    {tab.content}
                </div>
            ))}
        </>
    );
}
