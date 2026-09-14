const base = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
};

export function HomeIcon() {
    return (
        <svg {...base}>
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5.5 9.5V20a1 1 0 0 0 1 1H9.5v-5.5h5V21h3a1 1 0 0 0 1-1V9.5" />
        </svg>
    );
}

export function LibraryIcon() {
    return (
        <svg {...base}>
            <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
            <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
            <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
            <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
        </svg>
    );
}

export function SystemsIcon() {
    return (
        <svg {...base}>
            <rect x="2.5" y="6" width="19" height="12" rx="3" />
            <path d="M7 10.5v3M5.5 12h3" />
            <circle cx="16" cy="11" r="1" />
            <circle cx="18.5" cy="13.5" r="1" />
        </svg>
    );
}

export function SettingsIcon() {
    return (
        <svg {...base}>
            <circle cx="12" cy="12" r="3.25" />
            <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.09A1.6 1.6 0 0 0 9.1 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.09A1.6 1.6 0 0 0 4.6 9.1a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9.1a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.09a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9.1a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.47 1Z" />
        </svg>
    );
}

export function SearchIcon() {
    return (
        <svg {...base} width={18} height={18}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </svg>
    );
}

export function LogoMark() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" fill="var(--color-accent)" />
            <path
                d="M8.5 8h7v3.2H8.5zM9.75 13h4.5v3.5h-4.5z"
                fill="var(--color-accent-contrast)"
                opacity="0.92"
            />
        </svg>
    );
}

export function FavoritesIcon() {
    return (
        <svg {...base}>
            <path d="m12 4.5 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 10.2l5.4-.8Z" />
        </svg>
    );
}

export function SavesIcon() {
    return (
        <svg {...base}>
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h10L20 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" />
            <path d="M8 4v5h7V4M8 20v-5.5h8V20" />
        </svg>
    );
}

export function CollectionsIcon() {
    return <svg {...base}><rect x="4" y="7" width="16" height="14" rx="2" /><path d="M7 4h10M10 1h4" /><path d="M9 12h6M9 16h4" /></svg>;
}

export function PlayIcon() {
    return <svg {...base} fill="currentColor" stroke="none"><path d="M7 4.8c0-1 1.1-1.6 1.9-1.1l12 7.2a1.3 1.3 0 0 1 0 2.2l-12 7.2C8.1 20.8 7 20.2 7 19.2Z" /></svg>;
}

export function ArrowRightIcon() {
    return <svg {...base} width="16" height="16"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>;
}

export function ClockIcon() {
    return <svg {...base} width="16" height="16"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}

export function MoreIcon() {
    return <svg {...base}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
}
