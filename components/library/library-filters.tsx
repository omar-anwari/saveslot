"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { BrowseIcon } from "@/components/library/browse-icon";

export interface LibraryFiltersProps {
    platforms: { slug: string; name: string }[];
    years: number[];
    genres?: string[];
    regions?: string[];
    sorts: { value: string; label: string }[];
    favoritesOnly?: boolean;
    systemMode?: boolean;
}

const SELECT = "h-10 min-w-0 max-w-full rounded-sm border border-line bg-surface px-3 text-xs text-muted transition-colors hover:border-line-strong hover:bg-surface-hover focus:text-ink";

export function LibraryFilters({ platforms, years, genres = [], regions = [], sorts, favoritesOnly = false, systemMode = false }: LibraryFiltersProps) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const currentQuery = params.get("q") ?? "";
    const [term, setTerm] = useState(currentQuery);
    const [seen, setSeen] = useState(currentQuery);
    const [pending, startTransition] = useTransition();
    if (seen !== currentQuery) {
        setSeen(currentQuery);
        setTerm(currentQuery);
    }
    const update = useCallback(
        (changes: Record<string, string | null>) => {
            const next = new URLSearchParams(params.toString());
            for (const [key, value] of Object.entries(changes)) {
                if (value === null || value === "") next.delete(key);
                else next.set(key, value);
            }
            if (!("page" in changes)) next.delete("page");
            const query = next.toString();
            startTransition(() => router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, { scroll: false }));
        },
        [params, pathname, router],
    );
    useEffect(() => {
        if (term === currentQuery) return;
        const timer = setTimeout(() => update({ q: term }), 300);
        return () => clearTimeout(timer);
    }, [term, currentQuery, update]);
    const view = params.get("view") === "list" ? "list" : "grid";
    const filterKeys = ["q", "platform", "genre", "year", "region", "status", "hidden", ...(favoritesOnly ? [] : ["favourite"])];
    const active = filterKeys.filter((key) => (params.get(key) ?? "") !== "").length;
    const options = (values: string[]) => values.map((value) => <option key={value} value={value}>{value}</option>);
    return (
        <div aria-busy={pending} className={`space-y-4 transition-opacity ${pending ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full sm:w-64">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"><BrowseIcon name="search" width="16" height="16" /></span>
                    <input type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Filter by game title…" aria-label="Filter by title" className="h-10 w-full rounded-sm border border-line bg-elevated pr-3 pl-9 text-sm text-ink placeholder:text-subtle hover:border-line-strong" />
                </div>
                <div className="flex max-w-full items-center gap-3">
                    <span className="hidden text-xs text-subtle sm:block">Sort by</span>
                    <select aria-label="Sort by" className={SELECT} value={params.get("sort") ?? "title"} onChange={(event) => update({ sort: event.target.value })}>
                        {sorts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    {!systemMode ? <div className="flex shrink-0 items-center gap-0.5 rounded-sm border border-line bg-elevated p-1" role="group" aria-label="Library view">
                        {(["grid", "list"] as const).map((mode) => <button key={mode} type="button" aria-label={`${mode === "grid" ? "Grid" : "List"} view`} title={`${mode === "grid" ? "Grid" : "List"} view`} aria-pressed={view === mode} onClick={() => update({ view: mode === "grid" ? null : mode })} className={`flex h-8 w-9 items-center justify-center rounded-[5px] transition-colors ${view === mode ? "bg-accent-soft text-accent-hover" : "text-subtle hover:bg-surface-hover hover:text-ink"}`}><BrowseIcon name={mode} width="16" height="16" /></button>)}
                    </div> : null}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-y border-line py-4">
                {!systemMode ? <select aria-label="Platform" className={SELECT} value={params.get("platform") ?? ""} onChange={(event) => update({ platform: event.target.value })}>
                    <option value="">Platform: All</option>
                    {platforms.map((platform) => <option key={platform.slug} value={platform.slug}>{platform.name}</option>)}
                </select> : null}
                <select aria-label="Genre" className={SELECT} value={params.get("genre") ?? ""} onChange={(event) => update({ genre: event.target.value })}><option value="">Genre: All</option>{options(genres)}</select>
                {!systemMode ? <><select aria-label="Year" className={SELECT} value={params.get("year") ?? ""} onChange={(event) => update({ year: event.target.value })}><option value="">Year: All</option>{years.map((year) => <option key={year} value={String(year)}>{year}</option>)}</select>
                <select aria-label="Region" className={SELECT} value={params.get("region") ?? ""} onChange={(event) => update({ region: event.target.value })}><option value="">Region: All</option>{options(regions)}</select>
                {!favoritesOnly ? <select aria-label="Favorites" className={SELECT} value={params.get("favourite") ?? ""} onChange={(event) => update({ favourite: event.target.value })}><option value="">Favorites: Any</option><option value="true">Favorites only</option></select> : null}
                <select aria-label="Played status" className={SELECT} value={params.get("status") ?? ""} onChange={(event) => update({ status: event.target.value })}><option value="">Played status: All</option><option value="unplayed">Unplayed</option><option value="playing">Playing</option><option value="completed">Completed</option><option value="abandoned">Abandoned</option><option value="backlog">Backlog</option></select>
                <select aria-label="Hidden games" className={SELECT} value={params.get("hidden") ?? ""} onChange={(event) => update({ hidden: event.target.value })}><option value="">Hidden excluded</option><option value="include">Include hidden</option></select></> : null}
                {active > 0 ? <button type="button" onClick={() => { setTerm(""); update(Object.fromEntries(filterKeys.map((key) => [key, null]))); }} className="h-10 px-2 text-xs text-accent-hover hover:text-ink">Clear filters <span className="ml-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px]">{active}</span></button> : null}
            </div>
            <span role="status" className="sr-only">{pending ? "Updating games" : ""}</span>
        </div>
    );
}
