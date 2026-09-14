import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { platforms, scanEvents, scanRuns } from "@/db/schema";
import { serializeScanEvent, serializeScanRun } from "@/lib/api/serialize";
import { env } from "@/lib/config/env";
import { ScanPanel } from "@/components/settings/scan-panel";
import { DiagnosticsPanel } from "@/components/settings/diagnostics-panel";
import { ProvidersPanel } from "@/components/settings/providers-panel";
import packageJson from "@/package.json";
import { runDiagnostics, worstStatus } from "@/lib/diagnostics/doctor";
import Link from "next/link";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { ControllersPanel } from "@/components/settings/controllers-panel";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Settings",
};

function SettingsPanel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return <section className="rounded-lg border border-line bg-surface p-5 sm:p-7">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p> : null}
        <div className="mt-6">{children}</div>
    </section>;
}

function SettingsRows({ rows }: { rows: [string, ReactNode][] }) {
    return <dl className="divide-y divide-line">{rows.map(([label, value]) => (
        <div key={label} className="flex flex-col justify-between gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:gap-8">
            <dt className="shrink-0 text-sm text-muted">{label}</dt>
            <dd className="min-w-0 break-words text-sm sm:text-right">{value}</dd>
        </div>
    ))}</dl>;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
    const requestedTab = (await searchParams).tab;
    const checks = await runDiagnostics();
    const report = {
        status: worstStatus(checks),
        generatedAt: new Date().toISOString(),
        checks,
    };
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
        <main className="page-shell">
            <header className="page-header">
                <div>
                    <p className="eyebrow">MAKE YOURSELF AT HOME</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1>
                    <p className="mt-3 text-sm text-muted">Your library, your setup. Everything in one place.</p>
                </div>
                <span className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted"><span className={`h-1.5 w-1.5 rounded-full ${report.status === "ok" ? "bg-success" : "bg-warning"}`} />SaveSlot {packageJson.version}</span>
            </header>
            <SettingsTabs initialTab={["general", "appearance", "library", "saves", "emulator", "controllers"].includes(requestedTab ?? "") ? requestedTab! : "general"} tabs={[
                { id: "general", label: "General", content: <>
                    <SettingsPanel title="Your SaveSlot" description="A home for your games, ready whenever you are.">
                        <SettingsRows rows={[
                            ["Application", env.APP_NAME],
                            ["Version", packageJson.version],
                            ["Systems enabled", `${enabled.length} of ${rows.length}`],
                            ["Password protection", env.appPasswordEnabled ? "Enabled" : "Not enabled"],
                        ]} />
                    </SettingsPanel>
                    <DiagnosticsPanel appVersion={packageJson.version} initialReport={report} />
                </> },
                { id: "appearance", label: "Appearance", content: <SettingsPanel title="A little less light. A lot more focus." description="SaveSlot uses a dark theme with a violet accent, keeping your game artwork in the spotlight.">
                    <div className="max-w-md overflow-hidden rounded-lg border border-accent/40 bg-bg">
                        <div className="flex h-44 gap-4 p-4" aria-hidden="true">
                            <div className="w-16 rounded-sm border border-line bg-elevated p-2"><div className="mb-5 h-2 w-7 rounded bg-accent" /><div className="h-4 rounded bg-accent-soft" /><div className="mt-2 h-4 rounded bg-surface" /><div className="mt-2 h-4 rounded bg-surface" /></div>
                            <div className="flex-1"><div className="h-5 rounded bg-surface" /><div className="mt-3 h-14 rounded-sm bg-accent/15" /><div className="mt-3 grid grid-cols-3 gap-2"><div className="h-12 rounded-sm bg-surface" /><div className="h-12 rounded-sm bg-surface-active" /><div className="h-12 rounded-sm bg-surface" /></div></div>
                        </div>
                        <div className="flex items-center justify-between border-t border-line bg-surface px-5 py-4 text-sm"><span className="font-medium">SaveSlot Dark</span><span className="text-accent-hover">✓ Active theme</span></div>
                    </div>
                    <p className="mt-5 text-sm text-muted">Animations follow your device’s reduced motion preference.</p>
                </SettingsPanel> },
                { id: "library", label: "Library", content: <>
                    <ScanPanel platforms={enabled} initialScan={latestRun ? serializeScanRun(latestRun) : null} initialEvents={initialEvents} />
                    <SettingsPanel title="Library locations" description="These locations are managed in your server configuration (.env.local).">
                        <SettingsRows rows={[
                            ["ROM library", <code key="rom" className="text-xs">{env.ROM_LIBRARY_PATH}</code>],
                            ["Application data", <code key="data" className="text-xs">{env.APP_DATA_PATH}</code>],
                            ["File verification", env.scanHashAlgorithms.join(", ").toUpperCase()],
                        ]} />
                    </SettingsPanel>
                    <ProvidersPanel />
                </> },
                { id: "saves", label: "Saves", content: <SettingsPanel title="Keep your progress close" description="In-game saves sync while you play. Save states capture an exact moment so you can return to it later.">
                    <SettingsRows rows={[
                        ["In-game save sync", `Every ${env.EMULATORJS_FIXED_SAVE_INTERVAL_MS / 1000} seconds while playing`],
                        ["In-game save history", `${env.SAVE_HISTORY_LIMIT} versions per game and core`],
                        ["Save state history", `${env.STATE_HISTORY_LIMIT} per game, core, and save type`],
                        ["Save & Quit", "Creates an automatic save state on supported systems"],
                    ]} />
                    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6"><p className="text-xs text-subtle">Retention and sync frequency are managed in server configuration.</p><Link href="/saves" className="button-primary">Browse your saves <span aria-hidden="true">↗</span></Link></div>
                </SettingsPanel> },
                { id: "emulator", label: "Emulator", content: <>
                    <SettingsPanel title="Made for the game" description="Video, audio, and button mappings are available from the emulator menu while playing. Available options depend on the system.">
                        <div className="grid gap-4 sm:grid-cols-3">{[
                            ["Video", "Adjust the display and available graphics options."],
                            ["Audio", "Set your volume using the player’s audio controls."],
                            ["Controls", "Configure keyboard and connected controller inputs."],
                        ].map(([title, description]) => <div key={title} className="rounded-md border border-line bg-elevated p-5"><h3 className="text-sm font-medium">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{description}</p></div>)}</div>
                        <Link href="/library" className="button-secondary mt-6">Choose a game <span aria-hidden="true">→</span></Link>
                    </SettingsPanel>
                    <SettingsPanel title="Emulator configuration" description="Current server settings for the browser player.">
                        <SettingsRows rows={[
                            ["Engine", `EmulatorJS${env.EMULATORJS_VERSION ? ` ${env.EMULATORJS_VERSION}` : ""}`],
                            ["Threading", env.EMULATORJS_THREADS === "auto" ? "Automatic" : env.EMULATORJS_THREADS === "on" ? "Enabled" : "Disabled"],
                            ["Player overlay", "Hides after 3 seconds of inactivity"],
                        ]} />
                    </SettingsPanel>
                </> },
                { id: "controllers", label: "Controllers", content: <ControllersPanel /> },
            ]} />
        </main>
    );
}
