import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaceholderCover } from "@/components/library/placeholder-cover";
import { db } from "@/db/client";
import { getGameDetail } from "@/lib/games/query";
import { GameActions } from "@/components/library/game-actions";
import { formatBytes, formatPlaytime } from "@/lib/format";

export const dynamic = "force-dynamic";

const METADATA_LABELS: Record<string, string> = {
    unmatched: "No metadata match",
    matched: "Matched",
    partial: "Partial match",
    manual: "Manually edited",
    error: "Metadata error",
};

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const game = getGameDetail(db, slug);
    return { title: game?.title ?? "Game not found" };
}

export default async function GamePage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const game = getGameDetail(db, slug);
    if (!game) notFound();
    const anyPresent = game.files.some((file) => file.present);
    const isFixture = game.files.some((file) => file.isFixture);
    const facts: Array<[string, string]> = [
        ["Platform", game.platform.name],
        ["Release year", game.releaseYear ? String(game.releaseYear) : "Unknown"],
        ["Region", game.region ?? "Unknown"],
        ...(game.revision ? ([["Revision", game.revision]] as Array<[string, string]>) : []),
        ...(game.language ? ([["Languages", game.language]] as Array<[string, string]>) : []),
        ["Developer", game.developer ?? "Unknown"],
        ["Publisher", game.publisher ?? "Unknown"],
        ["Playtime", formatPlaytime(game.totalPlaySeconds)],
        [
            "Last played",
            game.lastPlayedAt ? game.lastPlayedAt.toLocaleString() : "Never",
        ],
    ];
    return (
        <main className="mx-auto w-full max-w-4xl px-6 py-12">
            <Link
                href="/library"
                className="text-sm text-muted underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
                ← Library
            </Link>
            <div className="mt-6 flex flex-col gap-8 sm:flex-row">
                <div className="w-40 shrink-0">
                    <PlaceholderCover
                        title={game.title}
                        platformSlug={game.platform.slug}
                    />
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="text-3xl font-semibold tracking-tight">
                        {game.title}
                    </h1>
                    <p className="mt-1 text-sm text-muted">
                        {game.platform.name}
                        {game.platform.manufacturer ? ` · ${game.platform.manufacturer}` : ""}
                    </p>
                    {isFixture ? (
                        <div className="mt-5">
                            <button
                                type="button"
                                disabled
                                className="cursor-not-allowed rounded bg-accent px-5 py-2.5 text-sm font-medium text-accent-contrast opacity-50"
                            >
                                Play
                            </button>
                            <p className="mt-2 text-sm text-warning">
                                Scanner test fixture &mdash; not a playable ROM.
                            </p>
                        </div>
                    ) : anyPresent && game.platform.emulatorCore ? (
                        <a
                            href={`/player/${game.slug}`}
                            className="mt-5 inline-block rounded bg-accent px-5 py-2.5 text-sm font-medium text-accent-contrast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            Play
                        </a>
                    ) : null}
                    <GameActions
                        slug={game.slug}
                        favourite={game.favourite}
                        playStatus={game.playStatus}
                    />
                    <div className="mt-4 space-y-2">
                        {!anyPresent ? (
                            <p className="rounded border border-warning/40 px-3 py-2 text-sm text-warning">
                                The file for this game is missing from the library. Its
                                catalogue entry, metadata and saves have been kept.
                            </p>
                        ) : null}
                        {game.platform.experimental ? (
                            <p className="rounded border border-warning/40 px-3 py-2 text-sm text-warning">
                                {game.platform.name} support is experimental. Emulation may be
                                slow or unreliable in the browser.
                            </p>
                        ) : null}
                        {game.platform.requiresBios ? (
                            <p className="rounded border border-warning/40 px-3 py-2 text-sm text-warning">
                                This platform requires BIOS files that you must supply.
                            </p>
                        ) : null}
                    </div>
                    {game.summary ? (
                        <p className="mt-5 text-sm leading-relaxed">{game.summary}</p>
                    ) : null}
                    <dl className="mt-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                        {facts.map(([label, value]) => (
                            <div key={label} className="flex gap-3">
                                <dt className="w-28 shrink-0 text-muted">{label}</dt>
                                <dd className="min-w-0 break-words">{value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
            <section className="mt-10 rounded-lg border border-line p-6">
                <h2 className="text-lg font-medium">Metadata</h2>
                <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex gap-3">
                        <dt className="w-32 shrink-0 text-muted">Status</dt>
                        <dd>{METADATA_LABELS[game.metadataStatus] ?? game.metadataStatus}</dd>
                    </div>
                    <div className="flex gap-3">
                        <dt className="w-32 shrink-0 text-muted">Provider</dt>
                        <dd>{game.metadataProvider ?? "None configured"}</dd>
                    </div>
                    {game.metadataConfidence !== null ? (
                        <div className="flex gap-3">
                            <dt className="w-32 shrink-0 text-muted">Confidence</dt>
                            <dd>{Math.round(game.metadataConfidence * 100)}%</dd>
                        </div>
                    ) : null}
                    <div className="flex gap-3">
                        <dt className="w-32 shrink-0 text-muted">Title source</dt>
                        <dd>
                            {game.metadataProvider
                                ? `${game.metadataProvider} — filename was “${game.filenameTitle}”`
                                : `Filename — “${game.filenameTitle}”`}
                        </dd>
                    </div>
                </dl>
                {game.candidates.length > 0 ? (
                    <div className="mt-6 space-y-3">
                        <h3 className="text-sm font-medium text-muted">Candidates</h3>
                        {game.candidates.map((candidate) => (
                            <div
                                key={`${candidate.providerKey}:${candidate.providerGameId}`}
                                className="rounded-md border border-line p-4"
                            >
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                    <span className="text-sm font-medium">{candidate.title}</span>
                                    <span className="text-xs text-muted">
                                        {candidate.providerKey} · {candidate.matchType} match ·{" "}
                                        {Math.round(candidate.score * 100)}%
                                    </span>
                                    {candidate.isSelected ? (
                                        <span className="rounded border border-line px-2 py-0.5 text-xs">
                                            Applied
                                        </span>
                                    ) : null}
                                </div>
                                {candidate.reasons.length > 0 ? (
                                    <ul className="mt-2 space-y-1 text-xs text-muted">
                                        {candidate.reasons.map((reason) => (
                                            <li key={reason.code}>
                                                <span className="font-mono">{reason.code}</span>{" "}
                                                {reason.delta >= 0 ? "+" : ""}
                                                {reason.delta.toFixed(2)} — {reason.detail}
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                                {candidate.externalIds.length > 0 ? (
                                    <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                        {candidate.externalIds.map((external) =>
                                            external.url === null ? (
                                                <span key={external.source} className="text-muted">
                                                    {external.source}
                                                </span>
                                            ) : (
                                                <a
                                                    key={external.source}
                                                    href={external.url}
                                                    target="_blank"
                                                    rel="noreferrer noopener"
                                                    className="underline underline-offset-2"
                                                >
                                                    {external.source}
                                                </a>
                                            ),
                                        )}
                                    </p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : null}
            </section>
            <section className="mt-6 rounded-lg border border-line p-6">
                <h2 className="text-lg font-medium">Files</h2>
                <ul className="mt-3 space-y-4">
                    {game.files.map((file) => (
                        <li key={file.relativePath} className="text-sm">
                            <p className="font-mono break-all">{file.relativePath}</p>
                            <p className="mt-1 text-xs text-muted">
                                {formatBytes(file.sizeBytes)} · {file.fileRole}
                                {file.discNumber ? ` · disc ${file.discNumber}` : ""} ·{" "}
                                {file.present ? "present" : "missing"}
                            </p>
                            {file.hashedEntry ? (
                                <p className="mt-1 text-xs text-muted">
                                    Checksums are of{" "}
                                    <span className="font-mono">{file.hashedEntry}</span> inside
                                    the archive.
                                </p>
                            ) : null}
                            {file.sha1 ? (
                                <dl className="mt-2 space-y-1 font-mono text-xs text-muted">
                                    <div className="flex gap-3">
                                        <dt className="w-14 shrink-0">CRC32</dt>
                                        <dd className="break-all">{file.crc32}</dd>
                                    </div>
                                    <div className="flex gap-3">
                                        <dt className="w-14 shrink-0">MD5</dt>
                                        <dd className="break-all">{file.md5}</dd>
                                    </div>
                                    <div className="flex gap-3">
                                        <dt className="w-14 shrink-0">SHA-1</dt>
                                        <dd className="break-all">{file.sha1}</dd>
                                    </div>
                                </dl>
                            ) : (
                                <p className="mt-2 text-xs text-muted">
                                    Not hashed yet. Run a full scan to compute checksums.
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            </section>
        </main>
    );
}