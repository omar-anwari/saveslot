import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { CoverImage } from "@/components/library/cover-image";
import { DetailIcon } from "@/components/library/detail-icon";
import { GameActions } from "@/components/library/game-actions";
import { MetadataEditor } from "@/components/library/metadata-editor";
import { RemoveGame } from "@/components/library/remove-game";
import { SaveBrowser, type GameSaveItem } from "@/components/library/save-browser";
import { artworkUrl } from "@/lib/artwork/url";
import { formatBytes, formatPlaytime, formatRelative } from "@/lib/format";
import { getGameDetail } from "@/lib/games/query";
import { gameIdForSlug } from "@/lib/games/metadata-edit";
import { listSaves } from "@/lib/saves/storage";
import { listStates } from "@/lib/saves/states";

export const dynamic = "force-dynamic";

const TABS = ["overview", "saves", "screenshots", "details"] as const;
type Tab = (typeof TABS)[number];
const METADATA_LABELS: Record<string, string> = {
    unmatched: "No metadata match", matched: "Matched", partial: "Partial match",
    manual: "Manually edited", error: "Metadata error",
};
const STATUS_LABELS: Record<string, string> = {
    unplayed: "Unplayed", playing: "Playing", completed: "Completed", abandoned: "Abandoned", backlog: "Backlog",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    return { title: getGameDetail(db, slug)?.title ?? "Game not found" };
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 py-1 sm:px-6 first:sm:pl-0">
            <dt className="text-[10px] font-medium uppercase tracking-[0.13em] text-subtle">{label}</dt>
            <dd className="mt-2 text-sm font-medium sm:text-base">{value}</dd>
        </div>
    );
}

export default async function GamePage({ params, searchParams }: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { slug } = await params;
    const query = await searchParams;
    const game = getGameDetail(db, slug);
    if (!game) notFound();
    const requested = typeof query.tab === "string" ? query.tab : "overview";
    const tab: Tab = (TABS as readonly string[]).includes(requested) ? requested as Tab : "overview";
    const selectedKey = typeof query.save === "string" ? query.save : undefined;
    const gameId = gameIdForSlug(db, slug);
    const saves = gameId === null ? [] : listSaves(db, gameId);
    const states = gameId === null ? [] : listStates(db, gameId);
    const screenshots = states.filter((state) => state.screenshotRelativePath !== null);
    const fixture = game.files.some((file) => file.isFixture);
    const playable = !fixture && game.platform.emulatorCore !== null && game.files.some((file) => file.present && file.fileRole === "primary");
    const currentSave = saves.find((save) => save.isCurrent && save.coreKey === game.platform.emulatorCore && save.slot === "main");
    const latestState = states.find((state) => state.coreKey === game.platform.emulatorCore);
    const resumable = Boolean(currentSave || latestState);
    const resumeState = latestState && (!currentSave || latestState.createdAt >= currentSave.createdAt) ? latestState : null;
    const playHref = `/player/${game.slug}${resumeState ? `?state=${resumeState.id}` : ""}`;
    const cover = artworkUrl(game.coverPath) ?? artworkUrl(game.coverThumbPath);
    const firstShot = screenshots[0];
    const backdrop = firstShot ? `/api/states/${firstShot.id}/screenshot` : cover;
    const stars = game.rating === null ? null : Math.round((game.rating / 20) * 10) / 10;
    const totalSaves = saves.length + states.length;
    const timestamp = (date: Date) => date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    const saveEntries: GameSaveItem[] = [
        ...saves.map((save): GameSaveItem => ({
            key: `battery-${save.id}`, id: String(save.id), kind: "battery",
            label: save.slot === "main" ? "In-game progress" : `In-game progress · ${save.slot}`,
            timestamp: timestamp(save.createdAt), relativeTime: formatRelative(save.createdAt), byteSize: formatBytes(save.byteSize),
            screenshotUrl: null, isCurrent: save.isCurrent,
            loadHref: playable && save.id === currentSave?.id ? `/player/${game.slug}` : null,
        })),
        ...states.map((state): GameSaveItem => ({
            key: `state-${state.id}`, id: state.id, kind: state.isAutosave ? "autosave" : "manual",
            label: state.label ?? (state.isAutosave ? "Auto save" : "Manual save"),
            timestamp: timestamp(state.createdAt), relativeTime: formatRelative(state.createdAt), byteSize: formatBytes(state.byteSize),
            screenshotUrl: state.screenshotRelativePath ? `/api/states/${state.id}/screenshot` : null, isCurrent: false,
            loadHref: playable && state.coreKey === game.platform.emulatorCore ? `/player/${game.slug}?state=${state.id}` : null,
        })),
    ];
    const saveDates = new Map<string, number>([
        ...saves.map((save) => [`battery-${save.id}`, save.createdAt.getTime()] as const),
        ...states.map((state) => [`state-${state.id}`, state.createdAt.getTime()] as const),
    ]);
    saveEntries.sort((a, b) => (saveDates.get(b.key) ?? 0) - (saveDates.get(a.key) ?? 0));

    return (
        <div className="page-shell">
            <Link href="/library" className="mb-5 inline-flex min-h-8 items-center gap-2 text-xs text-muted transition-colors hover:text-ink"><DetailIcon name="back" width={15} height={15} />Back to library</Link>
            <section className="relative rounded-xl border border-line bg-elevated">
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
                    {backdrop ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={backdrop} alt="" aria-hidden="true" className={`absolute inset-0 h-full w-full object-cover object-[center_35%] opacity-40 ${screenshots.length === 0 ? "scale-105 blur-[6px]" : ""}`} />
                    ) : <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(118,87,246,0.15),transparent_65%)]" />}
                    <div className="absolute inset-0 bg-gradient-to-r from-elevated via-elevated/80 to-elevated/30" />
                    <div className="absolute inset-0 bg-gradient-to-t from-elevated via-elevated/10 to-transparent" />
                </div>
                <div className="relative px-5 pt-6 sm:px-8 sm:pt-8 lg:px-9">
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8 lg:gap-10">
                        <div className="w-32 shrink-0 rounded-md shadow-[0_16px_40px_rgba(0,0,0,0.5)] ring-1 ring-white/10 sm:w-40 lg:w-44"><CoverImage title={game.title} platformSlug={game.platform.slug} src={cover} /></div>
                        <div className="min-w-0 flex-1 pb-1">
                            <Link href={`/platforms/${game.platform.slug}`} className="mb-3 inline-flex rounded-sm border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.13em] text-muted transition-colors hover:bg-white/10">{game.platform.name}</Link>
                            <h1 className="max-w-3xl text-2xl font-semibold leading-[1.12] tracking-[-0.035em] sm:text-3xl xl:text-4xl">{game.title}</h1>
                            {game.genres.length > 0 ? <p className="mt-3 text-sm text-muted">{game.genres.join(" · ")}</p> : null}
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-subtle">
                                {game.releaseYear ? <span>{game.releaseYear}</span> : null}
                                {game.players !== null ? <span>{game.players} player{game.players === 1 ? "" : "s"}</span> : null}
                                {stars !== null ? <span className="flex items-center gap-1.5 text-muted"><span className="text-warning" aria-hidden="true">★</span><span className="font-medium text-ink">{stars.toFixed(1)}</span><span>/ 5</span></span> : null}
                            </div>
                            <div className="mt-6 flex flex-wrap items-center gap-2.5">
                                {playable ? <Link href={playHref} className="button-primary min-w-32"><DetailIcon name="play" width={16} height={16} fill="currentColor" />{resumable ? "Resume" : "Play game"}</Link> : <span className="flex h-11 items-center rounded-sm border border-line px-4 text-xs text-warning">{fixture ? "Preview only" : game.platform.emulatorCore === null ? "System unavailable" : "Game file missing"}</span>}
                                <GameActions slug={game.slug} favourite={game.favourite} hidden={game.hidden} playStatus={game.playStatus} />
                            </div>
                        </div>
                    </div>
                    <dl className="relative mt-7 grid grid-cols-2 gap-x-5 gap-y-5 border-t border-white/8 py-5 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-white/8">
                        <Stat label="Play time" value={formatPlaytime(game.totalPlaySeconds)} />
                        <Stat label="Last played" value={game.lastPlayedAt ? formatRelative(game.lastPlayedAt) : "Never played"} />
                        <Stat label="Play status" value={STATUS_LABELS[game.playStatus] ?? game.playStatus} />
                        <Stat label="Saved progress" value={`${totalSaves} save${totalSaves === 1 ? "" : "s"}`} />
                    </dl>
                </div>
            </section>
            <nav className="mt-6 border-b border-line" aria-label="Game sections">
                <ul className="flex gap-5 sm:gap-8">
                    {TABS.map((name) => <li key={name}><Link href={name === "overview" ? `/games/${game.slug}` : `/games/${game.slug}?tab=${name}`} aria-current={tab === name ? "page" : undefined} scroll={false}
                        className={`-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 pb-4 pt-2 text-sm font-medium capitalize transition-colors ${tab === name ? "border-accent text-[#b09bff]" : "border-transparent text-muted hover:text-ink"}`}>
                        {name}{name === "saves" && totalSaves > 0 ? <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] leading-none text-muted">{totalSaves}</span> : null}
                    </Link></li>)}
                </ul>
            </nav>
            <div className="py-7 lg:py-8">
                {tab === "overview" ? <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.8fr)_minmax(250px,1fr)] xl:gap-12">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">About the game</h2>
                        {game.summary ? <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted">{game.summary}</p> : <p className="mt-3 text-sm leading-7 text-muted">This game is ready for a little more detail. <Link href={`/games/${game.slug}?tab=details`} className="text-[#b09bff] hover:underline">Add a description</Link> to make it your own.</p>}
                        {game.genres.length > 0 ? <div className="mt-5 flex flex-wrap gap-2">{game.genres.map((genre) => <span key={genre} className="rounded-sm border border-line bg-surface/60 px-3 py-1.5 text-[11px] text-muted">{genre}</span>)}</div> : null}
                        {screenshots.length > 0 ? <section className="mt-9">
                            <div className="section-heading"><h2>Screenshots</h2><Link href={`/games/${game.slug}?tab=screenshots`} className="section-link">View all <DetailIcon name="arrow" width={13} height={13} /></Link></div>
                            <div className="grid grid-cols-2 gap-3">{screenshots.slice(0, 2).map((state) => <Link key={state.id} href={`/games/${game.slug}?tab=saves&save=state-${state.id}`} className="group overflow-hidden rounded-md border border-line bg-surface">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/api/states/${state.id}/screenshot`} alt={state.label ?? `Save state from ${game.title}`} className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" />
                            </Link>)}</div>
                        </section> : null}
                    </div>
                    <aside className="rounded-lg border border-line bg-elevated p-5 sm:p-6">
                        <h2 className="text-sm font-medium">Game information</h2>
                        <dl className="mt-5 space-y-4 text-xs">{([
                            ["Developer", game.developer ?? "Unknown"], ["Publisher", game.publisher ?? "Unknown"],
                            ["Release year", game.releaseYear?.toString() ?? "Unknown"], ["Players", game.players?.toString() ?? "Unknown"],
                            ["Region", game.region ?? "Unknown"], ["Languages", game.language ?? "Unknown"],
                        ] as const).map(([label, value]) => <div key={label} className="flex justify-between gap-5"><dt className="shrink-0 text-subtle">{label}</dt><dd className="text-right text-muted">{value}</dd></div>)}</dl>
                        <Link href={`/games/${game.slug}?tab=details`} className="mt-5 flex items-center justify-between border-t border-line pt-4 text-xs text-muted hover:text-ink">View all details <DetailIcon name="arrow" width={13} height={13} /></Link>
                    </aside>
                </div> : null}
                {tab === "saves" ? <SaveBrowser key={selectedKey ?? "default"} slug={game.slug} entries={saveEntries} initialSelectedKey={selectedKey} playable={playable} /> : null}
                {tab === "screenshots" ? <section>
                    <div className="section-heading"><h2>Screenshots <span className="ml-1 text-sm font-normal text-subtle">{screenshots.length}</span></h2></div>
                    {screenshots.length === 0 ? <div className="empty-state"><span className="mb-4 text-subtle"><DetailIcon name="image" width={32} height={32} /></span><h3 className="text-base font-medium">No screenshots yet</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted">Save a state while you play and its screenshot will appear here.</p>{playable ? <Link href={playHref} className="button-secondary mt-5">Play game</Link> : null}</div> : <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {screenshots.map((state) => <li key={state.id}><Link href={`/games/${game.slug}?tab=saves&save=state-${state.id}`} className="group block overflow-hidden rounded-lg border border-line bg-elevated transition-colors hover:border-line-strong">
                            <div className="overflow-hidden">{/* eslint-disable-line @next/next/no-img-element */}<img src={`/api/states/${state.id}/screenshot`} alt={state.label ?? "Save state screenshot"} loading="lazy" className="aspect-video w-full bg-surface object-cover transition-transform duration-300 group-hover:scale-[1.025]" /></div>
                            <div className="p-4"><p className="truncate text-sm font-medium">{state.label ?? (state.isAutosave ? "Auto save" : "Manual save")}</p><p className="mt-1 text-xs text-subtle">{formatRelative(state.createdAt)}</p></div>
                        </Link></li>)}
                    </ul>}
                </section> : null}
                {tab === "details" ? <div className="max-w-4xl">
                    <section className="rounded-lg border border-line bg-elevated p-5 sm:p-6">
                        <div className="flex items-start justify-between gap-4"><h2 className="text-lg font-medium">Game files</h2><span className="rounded-sm bg-surface px-2.5 py-1 text-[10px] text-muted">{METADATA_LABELS[game.metadataStatus] ?? game.metadataStatus}</span></div>
                        <ul className="mt-4 divide-y divide-line">{game.files.map((file) => <li key={file.relativePath} className="py-4 first:pt-0 last:pb-0">
                            <p className="break-all font-mono text-xs text-muted">{file.relativePath}</p>
                            <p className="mt-2 text-xs text-subtle">{formatBytes(file.sizeBytes)} · {file.fileRole}{file.discNumber === null ? "" : ` · disc ${file.discNumber}`} · <span className={file.present ? "text-success/80" : "text-warning"}>{file.present ? "Available" : "Missing"}</span></p>
                            {file.hashedEntry ? <p className="mt-2 text-xs text-subtle">Checksums are of <span className="font-mono">{file.hashedEntry}</span> inside the archive.</p> : null}
                            {file.sha1 ? <dl className="mt-2 font-mono text-[10px] text-subtle"><div className="flex gap-3"><dt className="shrink-0">SHA-1</dt><dd className="break-all">{file.sha1}</dd></div></dl> : null}
                        </li>)}</ul>
                        {game.files.length === 0 ? <p className="mt-3 text-sm text-muted">No files are attached to this game.</p> : null}
                    </section>
                    <MetadataEditor slug={game.slug} filenameTitle={game.filenameTitle} locks={game.manualFields} candidates={game.candidates} values={{
                        title: game.title, summary: game.summary ?? "", releaseYear: game.releaseYear === null ? "" : String(game.releaseYear),
                        developer: game.developer ?? "", publisher: game.publisher ?? "", genres: game.genres.join(", "),
                        players: game.players === null ? "" : String(game.players), region: game.region ?? "",
                    }} />
                    <RemoveGame slug={game.slug} presentFiles={game.files.filter((file) => file.present).length} saves={saves.length} states={states.length} />
                </div> : null}
            </div>
        </div>
    );
}
