import Link from "next/link";
import { db } from "@/db/client";
import { SystemCard } from "@/components/home/system-card";
import { BrowseIcon } from "@/components/library/browse-icon";
import { availablePlatforms } from "@/lib/platforms/available";

export const dynamic = "force-dynamic";
export const metadata = { title: "Systems" };

export default async function PlatformsPage() {
    const all = availablePlatforms(db);
    const supported = all.filter((platform) => platform.coreInstalled);
    const inLibrary = all.filter((platform) => platform.gameCount > 0);
    const empty = supported.filter((platform) => platform.gameCount === 0);
    const totalGames = inLibrary.reduce((sum, platform) => sum + platform.gameCount, 0);
    return (
        <div className="page-shell">
            <header className="page-header">
                <div><p className="eyebrow">Explore your collection</p><h1>Systems</h1><p className="mt-2 text-sm text-muted">A world of games, across generations.</p></div>
                <Link href="/settings?tab=library" className="button-secondary">Add games<BrowseIcon name="arrow" width="15" height="15" /></Link>
            </header>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-medium">Your systems <span className="ml-2 text-xs font-normal text-subtle">{inLibrary.length}</span></h2><p className="text-xs text-subtle">{totalGames.toLocaleString()} games in your library</p></div>
            {inLibrary.length === 0 ? <div className="empty-state"><span className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-line bg-surface text-accent-hover"><BrowseIcon name="grid" width="25" height="25" /></span><h2 className="text-lg font-medium">Make room for your classics</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-muted">Add a game folder and scan your library. Your systems will find their home here.</p><Link href="/settings?tab=library" className="button-primary mt-6">Set up your library<BrowseIcon name="arrow" width="15" height="15" /></Link></div> : <ul className="system-grid">{inLibrary.sort((left, right) => right.gameCount - left.gameCount).map((platform) => <SystemCard key={platform.slug} slug={platform.slug} name={platform.name} gameCount={platform.gameCount} />)}</ul>}
            {empty.length > 0 ? <details className="group mt-10 rounded-lg border border-line bg-elevated p-5 sm:p-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-4"><span><span className="block text-sm font-medium">More to explore</span><span className="mt-1 block text-xs text-subtle">{empty.length} supported systems, ready for your games</span></span><span className="text-muted transition-transform group-open:rotate-90"><BrowseIcon name="chevron" width="17" height="17" /></span></summary><ul className="system-grid mt-6">{empty.map((platform) => <SystemCard key={platform.slug} slug={platform.slug} name={platform.name} gameCount={platform.gameCount} />)}</ul></details> : null}
        </div>
    );
}
