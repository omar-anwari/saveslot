import Link from "next/link";
import type { ReactNode } from "react";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { games, saves, saveStates } from "@/db/schema";
import { ContinueCard } from "@/components/home/continue-card";
import { ResumeHero } from "@/components/home/resume-hero";
import { SystemCard } from "@/components/home/system-card";
import { GameCard } from "@/components/library/game-card";
import { ArrowRightIcon, LibraryIcon } from "@/components/shell/icons";
import { availablePlatforms } from "@/lib/platforms/available";
import { continuePlaying, recentlyAdded, queryGames } from "@/lib/games/query";

export const dynamic = "force-dynamic";

function Section({ title, href, children }: { title: string; href: string; children: ReactNode }) {
    return <section className="mt-8">
        <div className="section-heading">
            <h2>{title}</h2>
            <Link href={href} className="section-link">View all <ArrowRightIcon /></Link>
        </div>
        {children}
    </section>;
}

export default async function HomePage() {
    const resuming = continuePlaying(db, 4);
    const recent = recentlyAdded(db, 9);
    const systems = availablePlatforms(db).filter((platform) => platform.gameCount > 0)
        .sort((left, right) => right.gameCount - left.gameCount);
    const featured = resuming[0] ?? recent[0];
    const total = queryGames(db, { pageSize: 1 }).total;
    const featuredSlugs = [...new Set([...resuming, ...(featured ? [featured] : [])].map((game) => game.slug))];
    const screenshots = new Map<string, string>();
    if (featuredSlugs.length) {
        const rows = db.select({ slug: games.slug, id: saveStates.id, screenshot: saveStates.screenshotRelativePath })
            .from(saveStates).innerJoin(games, eq(saveStates.gameId, games.id))
            .where(inArray(games.slug, featuredSlugs)).orderBy(desc(saveStates.createdAt)).all();
        for (const row of rows) {
            if (row.screenshot && !screenshots.has(row.slug)) screenshots.set(row.slug, `/api/states/${row.id}/screenshot`);
        }
    }
    const hasSave = featured ? db.select({ current: saves.isCurrent }).from(saves)
        .innerJoin(games, eq(saves.gameId, games.id)).where(eq(games.slug, featured.slug)).all().some((save) => save.current) : false;

    return <div className="page-shell">
        <header className="page-header">
            <div><h1>Home</h1></div>
            <Link href="/library" className="section-link"><LibraryIcon />{total.toLocaleString()} games<span className="mx-1 text-subtle">/</span>{systems.length} systems<ArrowRightIcon /></Link>
        </header>
        {featured ? <ResumeHero game={featured} hasSave={hasSave} screenshotUrl={screenshots.get(featured.slug)} /> : <div className="empty-state">
            <span className="mb-5 rounded-lg bg-accent-soft p-4 text-[#b4a4ff]"><LibraryIcon /></span>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">Add your games to your library folder, then scan your library to bring them here.</p>
            <Link href="/settings?tab=library" className="button-primary mt-6">Set up your library<ArrowRightIcon /></Link>
        </div>}
        {resuming.length ? <Section title="Continue playing" href="/library?sort=last-played">
            <ul className="continue-grid">{resuming.map((game) => <ContinueCard key={game.slug} game={game} screenshotUrl={screenshots.get(game.slug)} />)}</ul>
        </Section> : null}
        {recent.length ? <Section title="Recently added" href="/library?sort=recently-added">
            <ul className="recent-grid">{recent.map((game) => <GameCard key={game.slug} {...game} />)}</ul>
        </Section> : null}
        {systems.length ? <Section title="Your systems" href="/platforms">
            <ul className="system-grid">{systems.slice(0, 6).map((platform) => <SystemCard key={platform.slug} {...platform} />)}</ul>
        </Section> : null}
    </div>;
}
