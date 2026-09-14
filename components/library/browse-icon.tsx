import type { SVGProps } from "react";

type IconName = "grid" | "list" | "heart" | "clock" | "save" | "arrow" | "search" | "shuffle" | "chevron";

export function BrowseIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
    const paths = {
        grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
        list: <><path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1" /></>,
        heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
        clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
        save: <><path d="M4 5a1 1 0 0 1 1-1h11l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" /><path d="M8 4v6h7V4M8 20v-6h8v6" /></>,
        arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
        search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
        shuffle: <><path d="M3 6h2c5 0 9 12 14 12h2m-4-4 4 4-4 4M3 18h2c2 0 3.8-1.9 5.5-4.2M13.5 10C15.3 7.7 17 6 19 6h2m-4-4 4 4-4 4" /></>,
        chevron: <path d="m9 5 7 7-7 7" />,
    };
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
