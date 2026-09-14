import { db } from "@/db/client";
import { availablePlatforms, type AvailablePlatform } from "@/lib/platforms/available";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Platforms",
};

function ordinal(value: number): string {
    const suffix =
        value % 100 >= 11 && value % 100 <= 13
            ? "th"
            : ["th", "st", "nd", "rd"][value % 10] ?? "th";
    return `${value}${suffix}`;
}

function PlatformCard({ platform }: { platform: AvailablePlatform }) {
    return (
        <li className="rounded-lg border border-neutral-200 bg-white/60 p-5 dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="font-medium text-neutral-900 dark:text-neutral-100">
                        {platform.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-500">
                        {platform.manufacturer}
                        {platform.generation ? ` · ${ordinal(platform.generation)} generation` : ""}
                        {platform.gameCount > 0
                            ? ` · ${platform.gameCount} game${platform.gameCount === 1 ? "" : "s"}`
                            : ""}
                    </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    {platform.experimental ? (
                        <span className="rounded border border-amber-300 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-700/60 dark:text-amber-400">
                            Experimental
                        </span>
                    ) : null}
                    {platform.requiresBios ? (
                        <span className="rounded border border-amber-300 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-700/60 dark:text-amber-400">
                            Needs BIOS
                        </span>
                    ) : null}
                    {!platform.enabled ? (
                        <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                            Disabled
                        </span>
                    ) : null}
                </div>
            </div>
            <dl className="mt-4 space-y-2 text-xs">
                <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-neutral-500 dark:text-neutral-500">Core</dt>
                    <dd className="font-mono text-neutral-700 dark:text-neutral-300">
                        {platform.emulatorCore ?? "—"}
                    </dd>
                </div>
                <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-neutral-500 dark:text-neutral-500">Extensions</dt>
                    <dd className="font-mono text-neutral-700 dark:text-neutral-300">
                        {platform.extensionsJson.join(" ")}
                    </dd>
                </div>
                <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-neutral-500 dark:text-neutral-500">Folders</dt>
                    <dd className="font-mono text-neutral-700 dark:text-neutral-300">
                        {platform.folderAliasesJson.join(" ")}
                    </dd>
                </div>
            </dl>
        </li>
    );
}

export default async function PlatformsPage() {
    const all = availablePlatforms(db);
    const supported = all.filter((platform) => platform.coreInstalled);
    const inLibrary = supported.filter((platform) => platform.gameCount > 0);
    const empty = supported.filter((platform) => platform.gameCount === 0);
    return (
        <main className="mx-auto w-full max-w-5xl px-6 py-12">
            <header className="mb-10">
                <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                    Platforms
                </h1>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                    {all.length === 0
                        ? "No platforms are registered yet."
                        : `${inLibrary.length} in your library · ${supported.length} supported by the installed EmulatorJS build.`}
                </p>
            </header>
            {all.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Run <code className="font-mono">pnpm db:seed</code> to register the
                        supported systems.
                    </p>
                </div>
            ) : inLibrary.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        No platform has any games yet. Put files into a folder named after one
                        of the systems below, then run a scan.
                    </p>
                </div>
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2">
                    {inLibrary.map((platform) => (
                        <PlatformCard key={platform.slug} platform={platform} />
                    ))}
                </ul>
            )}
            {empty.length === 0 ? null : (
                <details className="mt-10">
                    <summary className="cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">
                        {empty.length} more supported systems with no games yet
                    </summary>
                    <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                        {empty.map((platform) => (
                            <PlatformCard key={platform.slug} platform={platform} />
                        ))}
                    </ul>
                </details>
            )}
        </main>
    );
}