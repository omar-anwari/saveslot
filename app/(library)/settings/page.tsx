import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { platforms, scanEvents, scanRuns } from "@/db/schema";
import { serializeScanEvent, serializeScanRun } from "@/lib/api/serialize";
import { env } from "@/lib/config/env";
import { ScanPanel } from "@/components/settings/scan-panel";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Settings",
};

export default async function SettingsPage() {
    const rows = db
        .select({
            slug: platforms.slug,
            name: platforms.name,
            enabled: platforms.enabled,
        })
        .from(platforms)
        .orderBy(asc(platforms.name))
        .all();
    const enabled = rows.filter((row) => row.enabled);
    const latestRun = db
        .select()
        .from(scanRuns)
        .orderBy(desc(scanRuns.createdAt))
        .get();
    const initialEvents = latestRun
        ? db
            .select()
            .from(scanEvents)
            .where(eq(scanEvents.scanRunId, latestRun.id))
            .orderBy(asc(scanEvents.id))
            .limit(200)
            .all()
            .map(serializeScanEvent)
        : [];
    return (
        <main className="mx-auto w-full max-w-3xl px-6 py-12">
            <header className="mb-10">
                <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
                <p className="mt-2 text-sm text-muted">
                    Library configuration, scanning, and diagnostics.
                </p>
            </header>
            <section className="mb-8 rounded-lg border border-line p-6">
                <h2 className="text-lg font-medium">Library</h2>
                <p className="mt-1 text-sm text-muted">
                    These paths are set in <code className="font-mono">.env.local</code>{" "}
                    and cannot be changed from this page.
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex gap-4">
                        <dt className="w-40 shrink-0 text-muted">ROM library</dt>
                        <dd className="font-mono">{env.ROM_LIBRARY_PATH}</dd>
                    </div>
                    <div className="flex gap-4">
                        <dt className="w-40 shrink-0 text-muted">Application data</dt>
                        <dd className="font-mono">{env.APP_DATA_PATH}</dd>
                    </div>
                    <div className="flex gap-4">
                        <dt className="w-40 shrink-0 text-muted">Hash algorithms</dt>
                        <dd className="font-mono">{env.scanHashAlgorithms.join(", ")}</dd>
                    </div>
                    <div className="flex gap-4">
                        <dt className="w-40 shrink-0 text-muted">Platforms enabled</dt>
                        <dd className="font-mono">
                            {enabled.length} of {rows.length}
                        </dd>
                    </div>
                </dl>
            </section>
            <ScanPanel
                platforms={enabled}
                initialScan={latestRun ? serializeScanRun(latestRun) : null}
                initialEvents={initialEvents}
            />
        </main>
    );
}