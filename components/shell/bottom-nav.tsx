"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PRIMARY_NAV, SECONDARY_NAV, isActive } from "@/components/shell/nav-items";
import { MoreIcon, SearchIcon } from "@/components/shell/icons";

export function BottomNav() {
    const pathname = usePathname();
    const [more, setMore] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (more) panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    }, [more]);
    function close() { setMore(false); trigger.current?.focus(); }
    return <nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-elevated/95 backdrop-blur-xl md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {more ? <>
            <button type="button" tabIndex={-1} aria-label="Close more navigation" onClick={close} className="fixed inset-x-0 bottom-full h-dvh bg-black/50" />
            <div ref={panel} id="mobile-more" className="absolute inset-x-3 bottom-[calc(100%+12px)] rounded-lg border border-line-strong bg-elevated p-3 shadow-card" onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
                <p className="px-3 py-2 text-xs font-medium text-muted">More from your library</p>
                {[...PRIMARY_NAV.slice(3), ...SECONDARY_NAV].map((item) => <Link key={item.href} href={item.href} onClick={() => setMore(false)} aria-current={isActive(pathname, item.href) ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-sm px-3 text-sm ${isActive(pathname, item.href) ? "bg-accent-soft text-[#b4a4ff]" : "text-muted hover:bg-surface-hover hover:text-ink"}`}>{item.icon}{item.label}</Link>)}
            </div>
        </> : null}
        <ul className="relative flex">
            {PRIMARY_NAV.slice(0, 3).map((item) => <li key={item.href} className="flex-1"><Link href={item.href} onClick={() => setMore(false)} aria-current={isActive(pathname, item.href) ? "page" : undefined} className={`flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium ${isActive(pathname, item.href) ? "text-[#b4a4ff]" : "text-muted"}`}>{item.icon}{item.label}</Link></li>)}
            <li className="flex-1"><button type="button" onClick={() => { setMore(false); window.dispatchEvent(new Event("saveslot:search")); }} className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted"><SearchIcon />Search</button></li>
            <li className="flex-1"><button ref={trigger} type="button" aria-expanded={more} aria-controls={more ? "mobile-more" : undefined} onClick={() => setMore(!more)} className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[10px] font-medium ${more || [...PRIMARY_NAV.slice(3), ...SECONDARY_NAV].some((item) => isActive(pathname, item.href)) ? "text-[#b4a4ff]" : "text-muted"}`}><MoreIcon />More</button></li>
        </ul>
    </nav>;
}
