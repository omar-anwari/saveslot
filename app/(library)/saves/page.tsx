import Link from "next/link";
import { db } from "@/db/client";
import { formatBytes, formatRelative } from "@/lib/format";
import { listAllSaves, type SaveEntry } from "@/lib/saves/overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saves" };

function Row({ entry }: { entry: SaveEntry }) {
    return (
        <li>
            <Link
                href={`/games/${entry.gameSlug}?tab=${entry.kind === "battery" ? "saves" : "screenshots"}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover"
            >
                {entry.screenshotUrl === null ? (
                    <span className="h-10 w-16 shrink-0 rounded-sm bg-surface" />
                ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={entry.screenshotUrl}
                        alt=""
                        loading="lazy"
                        className="h-10 w-16 shrink-0 rounded-sm object-cover"
                    />
                )}
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{entry.gameTitle}</span>
                    <span className="block truncate text-xs text-subtle">
                        {entry.platformName} · {entry.label}
                    </span>
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-subtle tabular-nums">
                    {formatBytes(entry.byteSize)}
                </span>
                <span className="w-28 shrink-0 text-right text-xs text-subtle">
                    {formatRelative(entry.createdAt)}
                </span>
            </Link>
        </li>
    );
}

function Section({ title, entries }: { title: string; entries: SaveEntry[] }) {
    if (entries.length === 0) return null;
    return (
        <section className="mt-8">
            <h2 className="mb-3 text-xl font-medium tracking-tight">
                {title} <span className="text-sm font-normal text-subtle">{entries.length}</span>
            </h2>
            <ul className="divide-y divide-line rounded-md border border-line">
                {entries.map((entry) => (
                    <Row key={entry.key} entry={entry} />
                ))}
            </ul>
        </section>
    );
}

export default async function SavesPage() {
    const all = listAllSaves(db);
    return (
        <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight">Saves</h1>
                <p className="mt-1 text-sm text-muted">
                    {all.length === 0
                        ? "Nothing saved yet."
                        : `${all.length} saves and states across your library.`}
                </p>
            </header>
            {all.length === 0 ? (
                <p className="mt-16 text-center text-sm text-muted">
                    Battery saves upload automatically while you play, and Save State captures
                    one on demand.
                </p>
            ) : (
                <>
                    <Section title="Recent" entries={all.slice(0, 10)} />
                    <Section title="Battery saves" entries={all.filter((entry) => entry.kind === "battery")} />
                    <Section title="Autosaves" entries={all.filter((entry) => entry.kind === "autosave")} />
                    <Section title="Manual states" entries={all.filter((entry) => entry.kind === "manual")} />
                </>
            )}
        </div>
    );
}