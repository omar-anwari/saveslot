"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmulatorAdapter } from "@/lib/emulatorjs/adapter";

declare global {
    interface Window {
        EJS_player?: string;
        EJS_gameUrl?: string;
        EJS_core?: string;
        EJS_pathtodata?: string;
        EJS_gameName?: string;
        EJS_gameID?: number;
        EJS_startOnLoaded?: boolean;
        EJS_alignStartButton?: string;
        EJS_threads?: boolean;
        EJS_defaultOptions?: Record<string, string>;
    }
}

type SyncState =
    | { kind: "booting" }
    | { kind: "restoring" }
    | { kind: "idle"; message: string }
    | { kind: "syncing" }
    | { kind: "synced"; at: Date }
    | { kind: "unchanged"; at: Date }
    | { kind: "conflict"; message: string }
    | { kind: "failed"; message: string };

interface StateItem {
    id: string;
    label: string | null;
    byteSize: number;
    isAutoSave: boolean;
    coreVersion: string | null;
    createdAt: string;
}

export interface InitialSave {
    id: number;
    checksumSha256: string;
}

export interface EmulatorProps {
    gameSlug: string;
    gameId: number;
    gameName: string;
    core: string;
    contentUrl: string;
    dataPath: string;
    threads: "auto" | "on" | "off";
    saveIntervalMs: number;
    initialSave: InitialSave | null;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export function Emulator({
    gameSlug,
    gameId,
    gameName,
    core,
    contentUrl,
    dataPath,
    threads,
    saveIntervalMs,
    initialSave,
}: EmulatorProps) {
    const started = useRef(false);
    const adapterRef = useRef<EmulatorAdapter | null>(null);
    const serverChecksum = useRef<string | null>(
        initialSave?.checksumSha256 ?? null,
    );
    const busy = useRef(false);
    const syncBlocked = useRef(false);
    const [state, setState] = useState<SyncState>({ kind: "booting" });
    const [quitting, setQuitting] = useState(false);
    const [states, setStates] = useState<StateItem[]>([]);
    const [statesOpen, setStatesOpen] = useState(false);
    const [statesSupported, setStatesSupported] = useState(false);
    const pushSave = useCallback(
        async (reason: "interval" | "quit"): Promise<SyncState> => {
            const adapter = adapterRef.current;
            if (!adapter?.ready) return { kind: "failed", message: "Emulator not ready." };
            if (syncBlocked.current) {
                return {
                    kind: "failed",
                    message: "Syncing is paused because the save could not be restored.",
                };
            }
            if (busy.current) return { kind: "syncing" };
            busy.current = true;
            try {
                const bytes = await adapter.readSave();
                if (!bytes) {
                    return { kind: "idle", message: "No save data written yet." };
                }
                const buffer = toArrayBuffer(bytes);
                const checksum = await sha256Hex(buffer);
                if (checksum === serverChecksum.current) {
                    return { kind: "unchanged", at: new Date() };
                }
                const url = new URL(
                    `/api/games/${gameSlug}/saves`,
                    window.location.origin,
                );
                url.searchParams.set("core", core);
                url.searchParams.set("ext", adapter.saveFileExtension ?? "srm");
                url.searchParams.set("checksum", checksum);
                url.searchParams.set("source", "emulator");
                if (serverChecksum.current) {
                    url.searchParams.set("baseChecksum", serverChecksum.current);
                }
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "content-type": "application/octet-stream" },
                    body: new Blob([buffer]),
                });
                if (response.status === 409) {
                    return {
                        kind: "conflict",
                        message:
                            "Another tab saved this game more recently. Your save was kept " +
                            "as a separate copy rather than overwriting it.",
                    };
                }
                if (!response.ok) {
                    const body = (await response.json()) as {
                        error?: { message?: string };
                    };
                    return {
                        kind: "failed",
                        message: body.error?.message ?? "The save could not be uploaded.",
                    };
                }
                const result = (await response.json()) as {
                    status: "stored" | "unchanged";
                    checksumSha256: string;
                };
                serverChecksum.current = result.checksumSha256;
                return result.status === "unchanged"
                    ? { kind: "unchanged", at: new Date() }
                    : { kind: "synced", at: new Date() };
            } catch {
                return {
                    kind: "failed",
                    message:
                        reason === "quit"
                            ? "The save could not be uploaded. Nothing was lost locally."
                            : "Save sync failed. Will retry.",
                };
            } finally {
                busy.current = false;
            }
        },
        [core, gameSlug],
    );
    const refreshStates = useCallback(async () => {
        const response = await fetch(
            `/api/games/${gameSlug}/states?core=${encodeURIComponent(core)}`,
            { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { states: StateItem[] };
        setStates(data.states);
    }, [core, gameSlug]);
    async function saveState() {
        const adapter = adapterRef.current;
        if (!adapter?.ready) return;
        setState({ kind: "syncing" });
        try {
            const bytes = await adapter.readState();
            const buffer = toArrayBuffer(bytes);
            const url = new URL(`/api/games/${gameSlug}/states`, window.location.origin);
            url.searchParams.set("core", core);
            url.searchParams.set("checksum", await sha256Hex(buffer));
            if (adapter.coreName) url.searchParams.set("coreVersion", adapter.coreName);
            const response = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/octet-stream" },
                body: new Blob([buffer]),
            });
            if (!response.ok) {
                setState({ kind: "failed", message: "The state could not be saved." });
                return;
            }
            await refreshStates();
            setState({ kind: "synced", at: new Date() });
        } catch (error) {
            setState({
                kind: "failed",
                message: `State capture failed: ${error instanceof Error ? error.message : String(error)
                    }`,
            });
        }
    }
    async function loadState(stateId: string) {
        const adapter = adapterRef.current;
        if (!adapter?.ready) return;
        setState({ kind: "syncing" });
        try {
            const response = await fetch(`/api/states/${stateId}/content`);
            if (!response.ok) throw new Error(`download returned ${response.status}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            await adapter.loadState(bytes);
            setStatesOpen(false);
            setState({ kind: "idle", message: "State loaded." });
        } catch (error) {
            setState({
                kind: "failed",
                message: `Loading the state failed: ${error instanceof Error ? error.message : String(error)
                    }`,
            });
        }
    }
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        window.EJS_player = "#emulator";
        window.EJS_gameUrl = contentUrl;
        window.EJS_core = core;
        window.EJS_pathtodata = dataPath;
        window.EJS_gameName = gameName;
        window.EJS_gameID = gameId;
        window.EJS_startOnLoaded = true;
        window.EJS_alignStartButton = "center";
        window.EJS_defaultOptions = { "save-state-location": "browser" };
        if (threads === "on") window.EJS_threads = true;
        if (threads === "off") window.EJS_threads = false;
        const script = document.createElement("script");
        script.src = `${dataPath}loader.js`;
        script.async = true;
        document.body.appendChild(script);
    }, [contentUrl, core, dataPath, gameId, gameName, threads]);
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setInterval> | null = null;
        async function begin() {
            const adapter = new EmulatorAdapter();
            adapterRef.current = adapter;
            try {
                await adapter.waitUntilReady();
            } catch {
                if (!cancelled) {
                    setState({ kind: "failed", message: "The emulator failed to start." });
                }
                return;
            }
            if (cancelled) return;
            if (initialSave) {
                setState({ kind: "restoring" });
                let step = "starting";
                try {
                    step = "waiting for the core to report a save path";
                    const savePath = await adapter.waitForSavePath();
                    console.log("[saveslot] save path:", JSON.stringify(savePath));
                    step = "downloading the save";
                    const response = await fetch(`/api/saves/${initialSave.id}/content`);
                    if (!response.ok) {
                        throw new Error(`download returned ${response.status}`);
                    }
                    const bytes = new Uint8Array(await response.arrayBuffer());
                    console.log("[saveslot] downloaded bytes:", bytes.length);
                    step = "writing the save into the emulator";
                    await adapter.loadSave(bytes);
                    step = "reading the save back";
                    const readBack = await adapter.readSave();
                    console.log("[saveslot] read back:", readBack?.length ?? null);
                    step = "comparing checksums";
                    const restored =
                        readBack !== null &&
                        (await sha256Hex(toArrayBuffer(readBack))) ===
                        initialSave.checksumSha256;
                    if (!restored) {
                        syncBlocked.current = true;
                        if (!cancelled) {
                            setState({
                                kind: "failed",
                                message:
                                    "The save was written but the core did not pick it up. " +
                                    "Syncing is paused so the server copy is not overwritten.",
                            });
                        }
                        return;
                    }
                    serverChecksum.current = initialSave.checksumSha256;
                    if (!cancelled) {
                        setState({ kind: "idle", message: "Save restored from the server." });
                    }
                } catch (error) {
                    syncBlocked.current = true;
                    const name =
                        error && typeof error === "object"
                            ? String((error as { name?: unknown }).name ?? "Error")
                            : "Error";
                    const errno =
                        error && typeof error === "object"
                            ? (error as { errno?: unknown }).errno
                            : undefined;
                    console.error("[saveslot] restore failed while", step, error);
                    if (!cancelled) {
                        setState({
                            kind: "failed",
                            message: `Restore failed while ${step} (${name}${errno === undefined ? "" : ` errno ${String(errno)}`
                                }). Syncing is paused so the server copy is not overwritten.`,
                        });
                    }
                    return;
                }
            } else if (!cancelled) {
                setState({ kind: "idle", message: "No server save for this game yet." });
            }
            try {
                setStatesSupported(adapter.supportsStates());
            } catch {
                setStatesSupported(false);
            }
            void refreshStates();
            timer = setInterval(() => {
                if (document.visibilityState !== "visible") return;
                void pushSave("interval").then((next) => {
                    if (!cancelled) setState(next);
                });
            }, saveIntervalMs);
        }
        void begin();
        return () => {
            cancelled = true;
            if (timer) clearInterval(timer);
        };
    }, [initialSave, pushSave, refreshStates, saveIntervalMs]);
    async function saveAndQuit() {
        setQuitting(true);
        setState({ kind: "syncing" });
        const adapter = adapterRef.current;
        if (adapter) await adapter.pause();
        const result = await pushSave("quit");
        setState(result);
        if (result.kind === "failed" || result.kind === "conflict") {
            if (adapter) await adapter.resume();
            setQuitting(false);
            setState({
                kind: "failed",
                message: `${result.kind === "conflict"
                    ? "Another tab saved more recently; your copy was kept separately."
                    : "The save could not be uploaded."
                    } Play continues — use Exit to leave without saving.`,
            });
            return;
        }
        window.location.assign(`/games/${gameSlug}`);
    }
    return (
        <>
            <div id="emulator" className="h-dvh w-dvw" />
            <div
                aria-live="polite"
                className="pointer-events-none absolute right-4 top-4 z-50 max-w-xs text-right text-xs text-white/80"
            >
                <StatusLine state={state} />
            </div>
            {statesOpen ? (
                <div className="absolute bottom-20 right-4 z-50 max-h-80 w-80 overflow-y-auto rounded border border-white/20 bg-black/85 p-3 backdrop-blur">
                    <h2 className="mb-2 text-sm font-medium text-white">Save states</h2>
                    {states.length === 0 ? (
                        <p className="text-xs text-white/70">
                            No states for this core yet. Use Save State to make one.
                        </p>
                    ) : (
                        <ul className="space-y-1">
                            {states.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => void loadState(item.id)}
                                        className="w-full rounded px-2 py-1.5 text-left text-xs text-white/90 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
                                    >
                                        <span className="block">{item.label ?? item.id}</span>
                                        <span className="block text-white/50">
                                            {item.isAutoSave ? "Autosave · " : ""}
                                            {Math.round(item.byteSize / 1024)} KB
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}
            <div className="absolute bottom-4 right-4 z-50 flex gap-2">
                {statesSupported ? (
                    <>
                        <button
                            type="button"
                            onClick={() => void saveState()}
                            className="rounded border border-white/40 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                            Save State
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatesOpen((open) => !open)}
                            aria-expanded={statesOpen}
                            className="rounded border border-white/40 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                            Load State ({states.length})
                        </button>
                    </>
                ) : null}
                <button
                    type="button"
                    onClick={() => void saveAndQuit()}
                    disabled={quitting}
                    className="rounded bg-white/90 px-4 py-2 text-sm font-medium text-black disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                    {quitting ? "Saving…" : "Save & Quit"}
                </button>
            </div>
        </>
    );
}

function StatusLine({ state }: { state: SyncState }) {
    switch (state.kind) {
        case "booting":
            return <span>Starting…</span>;
        case "restoring":
            return <span>Restoring your save…</span>;
        case "syncing":
            return <span>Saving to the server…</span>;
        case "synced":
            return <span>Saved {state.at.toLocaleTimeString()}</span>;
        case "unchanged":
            return <span>No changes since the last save</span>;
        case "idle":
            return <span>{state.message}</span>;
        case "conflict":
            return <span className="text-amber-300">Conflict: {state.message}</span>;
        case "failed":
            return <span className="text-amber-300">{state.message}</span>;
    }
}