"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { CollectionsIcon, LogoMark, SavesIcon, SearchIcon, SystemsIcon } from "@/components/shell/icons";

interface GameHit { slug: string; title: string; platformName: string; coverUrl: string | null }
interface SystemHit { slug: string; name: string; gameCount: number }
interface CollectionHit { name: string; href: string; gameCount: number }
interface Results { games: GameHit[]; systems: SystemHit[]; collections: CollectionHit[] }
const EMPTY: Results = { games: [], systems: [], collections: [] };

export function TopBar({ showSignOut }: { showSignOut: boolean }) {
    const router = useRouter();
    const input = useRef<HTMLInputElement>(null);
    const wrapper = useRef<HTMLDivElement>(null);
    const [term, setTerm] = useState("");
    const [results, setResults] = useState<Results>(EMPTY);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const items = [
        ...results.games.map((game) => ({ href: `/games/${game.slug}`, name: game.title, detail: game.platformName, image: game.coverUrl, kind: "Games" })),
        ...results.systems.map((system) => ({ href: `/platforms/${system.slug}`, name: system.name, detail: `${system.gameCount} games`, image: null, kind: "Systems" })),
        ...results.collections.map((collection) => ({ ...collection, detail: `${collection.gameCount} games`, image: null, kind: "Collections" })),
    ];
    useEffect(() => {
        const focusSearch = () => { input.current?.focus(); input.current?.select(); };
        function onKeyDown(event: KeyboardEvent) {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); focusSearch(); }
        }
        function onPointerDown(event: PointerEvent) {
            if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
        }
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("saveslot:search", focusSearch);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("saveslot:search", focusSearch);
        };
    }, []);
    useEffect(() => {
        const query = term.trim();
        const controller = new AbortController();
        const timer = setTimeout(() => {
            if (query.length < 2) { setResults(EMPTY); setLoading(false); return; }
            void fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
                .then(async (response) => { if (!response.ok) throw new Error("Search failed"); return response.json() as Promise<Results>; })
                .then((data) => { if (!controller.signal.aborted) { setResults(data); setActive(0); setLoading(false); } })
                .catch(() => { if (!controller.signal.aborted) { setResults(EMPTY); setFailed(true); setLoading(false); } });
        }, 180);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [term]);
    useEffect(() => {
        if (open) document.getElementById(`search-option-${active}`)?.scrollIntoView({ block: "nearest" });
    }, [active, open]);
    function go(href: string) { setOpen(false); (document.activeElement as HTMLElement | null)?.blur(); router.push(href); }
    const showPanel = open && term.trim().length >= 2;
    return <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-xl sm:gap-5 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0 md:hidden" aria-label="SaveSlot home"><LogoMark /></Link>
        <div ref={wrapper} className="relative w-full max-w-[540px]" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"><SearchIcon /></span>
            <input ref={input} type="text" role="combobox" aria-expanded={showPanel} aria-controls={showPanel ? "search-results" : undefined} aria-autocomplete="list"
                aria-activedescendant={showPanel && !loading && items.length ? `search-option-${active}` : undefined}
                value={term} onChange={(event) => { setTerm(event.target.value); setResults(EMPTY); setLoading(event.target.value.trim().length >= 2); setFailed(false); setActive(0); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onKeyDown={(event) => {
                    if (event.key === "Escape") { setOpen(false); return; }
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault(); setOpen(true);
                        if (items.length) setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
                    }
                    if (event.key === "Enter") {
                        event.preventDefault();
                        go(open && !loading && items[active] ? items[active].href : term.trim() ? `/library?q=${encodeURIComponent(term.trim())}` : "/library");
                    }
                }}
                placeholder="Search games, systems, collections…" aria-label="Search games, systems, collections"
                className="h-11 w-full rounded-sm border border-line bg-surface/80 pl-10 pr-3 text-sm text-ink transition-colors placeholder:text-muted hover:border-line-strong sm:pr-16" />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-muted sm:block">⌘ K</kbd>
            {showPanel ? <div className="absolute inset-x-0 top-[calc(100%+8px)] overflow-hidden rounded-md border border-line-strong bg-elevated shadow-card">
                <div id="search-results" role="listbox" aria-label="Search results" aria-busy={loading} className="horizontal-scroll max-h-[60vh] overflow-y-auto py-2">
                    {loading || failed || !items.length ? <p role="status" className="px-4 py-5 text-sm text-muted">{loading ? "Searching your library…" : failed ? "Search is unavailable. Try again in a moment." : `No results for “${term.trim()}”.`}</p> : items.map((item, index) => <div key={`${item.kind}-${item.href}`}>
                        {items[index - 1]?.kind !== item.kind ? <p role="presentation" className="px-4 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-subtle">{item.kind}</p> : null}
                        <button id={`search-option-${index}`} type="button" role="option" tabIndex={-1} aria-selected={active === index} onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => go(item.href)}
                            className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left ${active === index ? "bg-accent-soft" : "hover:bg-surface-hover"}`}>
                            <span className="flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-active text-muted">
                                {item.image ? <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={item.image} alt="" className="h-full w-full object-cover" />
                                </> : item.kind === "Systems" ? <SystemsIcon /> : <CollectionsIcon />}
                            </span>
                            <span className="min-w-0"><span className="block truncate text-sm font-medium">{item.name}</span><span className="mt-0.5 block truncate text-xs text-muted">{item.detail}</span></span>
                        </button>
                    </div>)}
                </div>
                <Link href={`/library?q=${encodeURIComponent(term.trim())}`} onClick={() => setOpen(false)} className="block border-t border-line px-4 py-3 text-xs text-muted hover:text-ink">See all game results <span aria-hidden="true">→</span></Link>
            </div> : null}
        </div>
        <div className="ml-auto hidden shrink-0 items-center gap-3 sm:flex">
            <Link href="/saves" aria-label="Recent saves" title="Recent saves" className="flex h-11 w-11 items-center justify-center rounded-sm border border-line text-muted hover:bg-surface-hover hover:text-ink"><SavesIcon /></Link>
            {showSignOut ? <SignOutButton /> : null}
        </div>
    </header>;
}
