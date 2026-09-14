import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Emulator } from "@/components/player/emulator";
import { coreHasBatterySave } from "@/lib/emulatorjs/manifest";
import { db } from "@/db/client";
import { games } from "@/db/schema";
import { env } from "@/lib/config/env";
import { getGameDetail } from "@/lib/games/query";
import { currentSave } from "@/lib/saves/storage";
import { getSaveState } from "@/lib/saves/states";

export const dynamic = "force-dynamic";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const game = getGameDetail(db, slug);
    return { title: game ? `Playing ${game.title}` : "Player" };
}
function Blocked({ slug, message }: { slug: string; message: string }) {
    return (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-lg border border-line bg-surface text-2xl text-accent-hover" aria-hidden="true">▷</div>
            <p className="eyebrow">PLAYER</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">We couldn’t start this game</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted">{message}</p>
            <Link
                href={`/games/${slug}`}
                className="button-primary mt-7"
            >
                Back to the game
            </Link>
        </main>
    );
}

export default async function PlayerPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ state?: string }>;
}) {
    const { slug } = await params;
    const game = getGameDetail(db, slug);
    if (!game) notFound();
    const row = db
        .select({ id: games.id })
        .from(games)
        .where(eq(games.slug, slug))
        .get();
    if (!row) notFound();
    const primary = game.files.find(
        (file) => file.fileRole === "primary" && file.present,
    );
    if (game.files.some((file) => file.isFixture)) {
        return (
            <Blocked
                slug={slug}
                message="Scanner test fixture — not a playable ROM."
            />
        );
    }
    if (!primary) {
        return (
            <Blocked
                slug={slug}
                message="The file for this game is missing. Restore it to your library and run a scan."
            />
        );
    }
    if (!game.platform.emulatorCore) {
        return (
            <Blocked
                slug={slug}
                message={`No emulator core is configured for ${game.platform.name}.`}
            />
        );
    }
    const existing = currentSave(db, row.id, game.platform.emulatorCore);
    const stateId = (await searchParams).state;
    const selectedState = stateId ? getSaveState(db, stateId) : null;
    if (stateId && (!selectedState || selectedState.gameId !== row.id || selectedState.coreKey !== game.platform.emulatorCore)) {
        return <Blocked slug={slug} message="This save state is no longer available for this game and system. Choose another save from the game page." />;
    }
    return (
        <div className="fixed inset-0 overflow-hidden bg-black">
            <Emulator
                gameSlug={slug}
                gameId={row.id}
                gameName={game.title}
                platformName={game.platform.name}
                core={game.platform.emulatorCore}
                hasBatterySave={coreHasBatterySave(game.platform.emulatorCore)}
                contentUrl={`/api/games/${slug}/content`}
                dataPath={env.EMULATORJS_DATA_PATH}
                threads={env.EMULATORJS_THREADS}
                saveIntervalMs={env.EMULATORJS_FIXED_SAVE_INTERVAL_MS}
                initialSave={
                    existing
                        ? { id: existing.id, checksumSha256: existing.checksumSha256 }
                        : null
                }
                initialState={selectedState ? { id: selectedState.id, checksumSha256: selectedState.checksumSha256 } : null}
            />
        </div>
    );
}
