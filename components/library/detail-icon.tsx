import type { SVGProps } from "react";

const paths = {
    play: "m9 5 11 7-11 7V5Z",
    back: "m14 6-6 6 6 6M8 12h13",
    arrow: "m9 5 7 7-7 7",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
    image: "M4 4h16v16H4V4Zm0 11 5-5 8 10m-3-6 2-2 4 4M15 8h.01",
    save: "M4 4h12l4 4v12H4V4Zm4 0v6h7V4M8 20v-6h8v6",
    clock: "M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
    download: "M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5",
    plus: "M12 5v14M5 12h14",
} as const;

export function DetailIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
            <path d={paths[name]} />
        </svg>
    );
}
