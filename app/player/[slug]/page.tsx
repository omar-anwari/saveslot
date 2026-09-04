import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Emulator } from "@/components/player/emulator";
import { db } from "@/db/client";
import { games } from "@/db/schema";
import { env } from "@/lib/config/env";
import { getGameDetail } from "@/lib/games/query";
import { currentSave } from "@/lib/saves/storage";

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
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm">{message}</p>
            <Link
                href={`/games/${slug}`}
                className="text-sm text-accent underline-offset-4 hover:underline"
            >
                Back to the game
            </Link>
        </main>
    );
}

export default async function PlayerPage({
    params,
}: {
    params: Promise<{ slug: string }>;
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
    return (
        <div className="relative bg-black">
            <a
                href={`/games/${slug}`}
                className="absolute left-4 top-4 z-50 rounded bg-black/60 px-3 py-1.5 text-sm text-white/90 backdrop-blur focus-visible:outline-2 focus-visible:outline-white"
            >
                ← Exit
            </a>
            <Emulator
                gameSlug={slug}
                gameId={row.id}
                gameName={game.title}
                core={game.platform.emulatorCore}
                contentUrl={`/api/games/${slug}/content`}
                dataPath={env.EMULATORJS_DATA_PATH}
                threads={env.EMULATORJS_THREADS}
                saveIntervalMs={env.EMULATORJS_FIXED_SAVE_INTERVAL_MS}
                initialSave={
                    existing
                        ? { id: existing.id, checksumSha256: existing.checksumSha256 }
                        : null
                }
            />
        </div>
    );
}