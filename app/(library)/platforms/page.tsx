import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { platforms } from "@/db/schema";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Platforms"
};

export default async function PlatformsPage() {
    const rows = db.select().from(platforms).orderBy(asc(platforms.name)).all();

    const enabledCount = rows.filter((row) => row.enabled).length;

    return (
        <main className="mx-auto w-full max-w-5xl px-6 py-12">
            <header className="mb-10">
                <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                    Platforms
                </h1>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                    {rows.length === 0
                        ? "No platforms are registered yet."
                        : `${enabledCount} of ${rows.length} systems enabled.`}
                </p>
            </header>

            {rows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Run <code className="font-mono">pnpm db:seed</code> to register the
                        supported systems.
                    </p>
                </div>
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2">
                    {rows.map((platform) => (
                        <li
                            key={platform.slug}
                            className="rounded-lg border border-neutral-200 bg-white/60 p-5 dark:border-neutral-800 dark:bg-neutral-900/40"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="font-medium text-neutral-900 dark:text-neutral-100">
                                        {platform.name}
                                    </h2>
                                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-500">
                                        {platform.manufacturer}
                                        {platform.generation
                                            ? ` · Generation ${platform.generation}`
                                            : ""}
                                    </p>
                                </div>

                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    {platform.experimental ? (
                                        <span className="rounded border border-amber-300 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-700/60 dark:text-amber-400">
                                            Experimental
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
                                    <dt className="w-24 shrink-0 text-neutral-500 dark:text-neutral-500">
                                        Core
                                    </dt>
                                    <dd className="font-mono text-neutral-700 dark:text-neutral-300">
                                        {platform.emulatorCore ?? "—"}
                                    </dd>
                                </div>
                                <div className="flex gap-2">
                                    <dt className="w-24 shrink-0 text-neutral-500 dark:text-neutral-500">
                                        Extensions
                                    </dt>
                                    <dd className="font-mono text-neutral-700 dark:text-neutral-300">
                                        {platform.extensionsJson.join(" ")}
                                    </dd>
                                </div>
                                <div className="flex gap-2">
                                    <dt className="w-24 shrink-0 text-neutral-500 dark:text-neutral-500">
                                        Folders
                                    </dt>
                                    <dd className="font-mono text-neutral-700 dark:text-neutral-300">
                                        {platform.folderAliasesJson.join(" ")}
                                    </dd>
                                </div>
                            </dl>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}