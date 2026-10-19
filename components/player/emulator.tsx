"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmulatorAdapter } from "@/lib/emulatorjs/adapter";
import { sha256HexSync } from "@/lib/saves/sha256";

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
        EJS_ready?: () => void;
        EJS_onGameStart?: () => void;
        EJS_Buttons?: Record<string, boolean>;
        EJS_hideSettings?: string[];
        EJS_onSaveState?: () => void;
        EJS_onLoadState?: () => void;
    }
}

type SyncState =
    | { kind: "booting" }
    | { kind: "restoring" }
    | { kind: "idle"; message: string }
    | { kind: "syncing" }
    | { kind: "synced"; at: Date; message?: string }
    | { kind: "unchanged"; at: Date }
    | { kind: "conflict"; message: string }
    | { kind: "failed"; message: string }
    | { kind: "quit"; steps: QuitStep[]; ok: boolean };

type StepStatus = "ok" | "skipped" | "failed";

interface QuitStep {
    label: string;
    status: StepStatus;
    detail: string | null;
}

const OVERLAY_IDLE_MS = 3000;

const QUIT_SETTLE_MS = 300;

function clock(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value: number) => String(value).padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

const CAPTURE_AUTOSAVE_ON_QUIT = true;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

interface StateItem {
    id: string;
    label: string | null;
    byteSize: number;
    isAutosave: boolean;
    coreVersion: string | null;
    hasScreenshot: boolean;
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
    platformName: string;
    core: string;
    hasBatterySave: boolean;
    contentUrl: string;
    dataPath: string;
    threads: "auto" | "on" | "off";
    saveIntervalMs: number;
    initialSave: InitialSave | null;
    initialState?: { id: string; checksumSha256: string } | null;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

const CLIENT_ID_KEY = "saveslot.clientId";
function randomId(): string {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function clientId(): string {
    try {
        const existing = localStorage.getItem(CLIENT_ID_KEY);
        if (existing) return existing;
        const created = randomId();
        localStorage.setItem(CLIENT_ID_KEY, created);
        return created;
    } catch {
        return randomId();
    }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
    if (globalThis.crypto?.subtle === undefined) return sha256HexSync(new Uint8Array(buffer));
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export function Emulator({
    gameSlug,
    gameId,
    gameName,
    platformName,
    core,
    hasBatterySave,
    contentUrl,
    dataPath,
    threads,
    saveIntervalMs,
    initialSave,
    initialState,
}: EmulatorProps) {
    const started = useRef(false);
    const adapterRef = useRef<EmulatorAdapter | null>(null);
    const serverChecksum = useRef<string | null>(
        initialSave?.checksumSha256 ?? null,
    );
    const busy = useRef(false);
    const sessionId = useRef<string | null>(null);
    const sessionStarted = useRef(false);
    const syncBlocked = useRef(false);
    const [state, setState] = useState<SyncState>({ kind: "booting" });
    const [quitting, setQuitting] = useState(false);
    const [overlayVisible, setOverlayVisible] = useState(true);
    const [elapsed, setElapsed] = useState(0);
    const [isolated, setIsolated] = useState<boolean | null>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const [states, setStates] = useState<StateItem[]>([]);
    const [statesOpen, setStatesOpen] = useState(false);
    const playerActions = useRef<{ saveState: () => void; openStates: () => void } | null>(null);
    const [stateBusy, setStateBusy] = useState(false);
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
        if (!adapter?.ready || stateBusy || quitting) return;
        setStateBusy(true);
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
            const { stateId } = (await response.json()) as { stateId: string };
            try {
                const shot = await adapter.captureScreenshot();
                await fetch(`/api/states/${stateId}/screenshot`, {
                    method: "POST",
                    headers: { "content-type": "image/png" },
                    body: new Blob([toArrayBuffer(shot)]),
                });
            } catch {
            }
            await refreshStates();
            setState({ kind: "synced", at: new Date(), message: "Save state created" });
        } catch (error) {
            setState({
                kind: "failed",
                message: `State capture failed: ${error instanceof Error ? error.message : String(error)
                    }`,
            });
        } finally {
            setStateBusy(false);
        }
    }
    async function loadState(stateId: string) {
        const adapter = adapterRef.current;
        if (!adapter?.ready || stateBusy || quitting) return;
        setStateBusy(true);
        setState({ kind: "restoring" });
        try {
            const response = await fetch(`/api/states/${stateId}/content`);
            if (!response.ok) throw new Error(`download returned ${response.status}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            await adapter.loadState(bytes);
            setStatesOpen(false);
            setState({ kind: "synced", at: new Date(), message: "Save state loaded" });
        } catch (error) {
            setState({
                kind: "failed",
                message: `Loading the state failed: ${error instanceof Error ? error.message : String(error)
                    }`,
            });
        } finally {
            setStateBusy(false);
        }
    }
    useEffect(() => {
        playerActions.current = {
            saveState: () => void saveState(),
            openStates: () => {
                void refreshStates();
                setStatesOpen(true);
            },
        };
    });
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
        window.EJS_Buttons = {
            saveSavFiles: false,
            loadSavFiles: false,
            quickSave: false,
            quickLoad: false,
            exitEmulation: false,
            netplay: false,
            cacheManager: false,
        };
        window.EJS_hideSettings = ["save-state-location", "save-state-slot"];
        window.EJS_onSaveState = () => playerActions.current?.saveState();
        window.EJS_onLoadState = () => playerActions.current?.openStates();
        window.EJS_ready = () => {
            if (window.matchMedia("(pointer: coarse)").matches && window.EJS_emulator) window.EJS_emulator.touch = true;
        };
        window.EJS_onGameStart = () => {
            window.dispatchEvent(new Event("resize"));
            if (!window.matchMedia("(pointer: coarse)").matches) return;
            window.setTimeout(() => {
                const emulator = window.EJS_emulator;
                if (emulator?.getSettingValue?.("virtual-gamepad") === "disabled") return;
                emulator?.toggleVirtualGamepad?.(true);
            }, 300);
        };
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
                setIsolated(globalThis.crossOriginIsolated);
                void refreshStates();
                if (!sessionStarted.current) {
                    sessionStarted.current = true;
                    try {
                        const response = await fetch(`/api/games/${gameSlug}/sessions/start`, {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ core, clientId: clientId() }),
                        });
                        if (response.ok) {
                            const data = (await response.json()) as { sessionId: string };
                            sessionId.current = data.sessionId;
                        }
                    } catch {
                    }
                }
            } catch {
                if (!cancelled) {
                    setState({ kind: "failed", message: "The emulator failed to start." });
                }
                return;
            }
            if (cancelled) return;
            if (!hasBatterySave) {
                if (!cancelled) {
                    setState({
                        kind: "idle",
                        message: "This system has no battery save — use Save State to keep progress.",
                    });
                }
            } else if (initialSave) {
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
            if (initialState && !cancelled) {
                setState({ kind: "restoring" });
                try {
                    const response = await fetch(`/api/states/${initialState.id}/content`);
                    if (!response.ok) throw new Error("The selected save state could not be downloaded.");
                    const buffer = await response.arrayBuffer();
                    if (await sha256Hex(buffer) !== initialState.checksumSha256) {
                        throw new Error("The selected save state failed its integrity check.");
                    }
                    if (cancelled) return;
                    await adapter.loadState(new Uint8Array(buffer));
                    setState({ kind: "synced", at: new Date(), message: "Save state loaded" });
                } catch (error) {
                    syncBlocked.current = true;
                    setState({ kind: "failed", message: `${errorMessage(error)} Save syncing is paused. Return to the game page to choose another save.` });
                    return;
                }
            }
            void refreshStates();
            if (hasBatterySave) {
                timer = setInterval(() => {
                    if (document.visibilityState !== "visible") return;
                    void pushSave("interval").then((next) => {
                        if (!cancelled) setState(next);
                    });
                }, saveIntervalMs);
            }
        }
        void begin();
        const beat = setInterval(() => {
            const id = sessionId.current;
            if (!id || document.visibilityState !== "visible") return;
            void fetch(`/api/sessions/${id}/heartbeat`, { method: "POST" }).then((response) => {
                if (response.status === 404) sessionId.current = null;
            },
            );
        }, 30_000);
        const onPageHide = () => {
            const id = sessionId.current;
            if (!id) return;
            navigator.sendBeacon(`/api/sessions/${id}/end?reason=navigation`);
            sessionId.current = null;
        };
        window.addEventListener("pagehide", onPageHide);
        return () => {
            cancelled = true;
            if (timer) clearInterval(timer);
            clearInterval(beat);
            window.removeEventListener("pagehide", onPageHide);
        };
    }, [initialSave, initialState, pushSave, refreshStates, saveIntervalMs, core, gameSlug, hasBatterySave]);
    useEffect(() => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, []);
    useEffect(() => {
        const schedule = () => {
            if (hideTimer.current !== null) clearTimeout(hideTimer.current);
            hideTimer.current = setTimeout(() => {
                const focused = document.activeElement;
                const inside = focused instanceof Element && overlayRef.current?.contains(focused) === true;
                if (inside && focused.matches(":focus-visible")) return;
                setOverlayVisible(false);
                if (inside) document.getElementById("emulator")?.focus();
            }, OVERLAY_IDLE_MS);
        };
        const show = (event?: Event) => {
            if (event?.target instanceof Element && event.target.closest(".ejs_virtualGamepad_parent")) return;
            setOverlayVisible(true);
            schedule();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                if (overlayRef.current?.contains(document.activeElement)) {
                    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
                    setOverlayVisible(false);
                    document.getElementById("emulator")?.focus();
                } else show();
                return;
            }
            if (event.key === "Tab") show();
        };
        let menuPressed = false;
        const controllerTimer = window.setInterval(() => {
            try {
                const pressed = Array.from(navigator.getGamepads?.() ?? []).some((pad) => pad?.buttons[9]?.pressed || pad?.buttons[16]?.pressed);
                if (pressed && !menuPressed) show();
                menuPressed = pressed;
            } catch { /* Controller access is optional. */ }
        }, 200);
        schedule();
        window.addEventListener("mousemove", show);
        window.addEventListener("touchstart", show);
        window.addEventListener("keydown", onKey);
        return () => {
            if (hideTimer.current !== null) clearTimeout(hideTimer.current);
            window.clearInterval(controllerTimer);
            window.removeEventListener("mousemove", show);
            window.removeEventListener("touchstart", show);
            window.removeEventListener("keydown", onKey);
        };
    }, []);
    async function saveAndQuit() {
        if (quitting || stateBusy) return;
        setQuitting(true);
        const steps: QuitStep[] = [];
        function record(label: string, status: StepStatus, detail: string | null = null) {
            steps.push({ label, status, detail });
            setState({
                kind: "quit",
                steps: [...steps],
                ok: steps.every((step) => step.status !== "failed"),
            });
        }
        const adapter = adapterRef.current;
        if (!adapter?.ready) {
            record("Emulator", "failed", "It is not running, so there is nothing to save.");
            setQuitting(false);
            return;
        }
        let screenshot: Uint8Array | null = null;
        try {
            screenshot = await adapter.captureScreenshot();
            record("Screenshot", "ok");
        } catch (error) {
            record("Screenshot", "failed", errorMessage(error));
        }
        await adapter.pause();
        await sleep(QUIT_SETTLE_MS);
        record("Emulation paused", "ok", `Settled for ${QUIT_SETTLE_MS}ms.`);
        if (!hasBatterySave) {
            record("Battery save", "skipped", "This system has none.");
        } else {
            const saveResult = await pushSave("quit");
            switch (saveResult.kind) {
                case "synced":
                    record("Battery save", "ok", "Uploaded.");
                    break;
                case "unchanged":
                    record("Battery save", "ok", "Unchanged since the last sync.");
                    break;
                case "idle":
                    record("Battery save", "skipped", saveResult.message);
                    break;
                case "conflict":
                    record(
                        "Battery save",
                        "failed",
                        "Another tab saved more recently; your copy was kept as a separate save.",
                    );
                    break;
                default:
                    record(
                        "Battery save",
                        "failed",
                        saveResult.kind === "failed" ? saveResult.message : "The upload failed.",
                    );
                    break;
            }
        }
        if (!CAPTURE_AUTOSAVE_ON_QUIT) {
            record("Autosave state", "skipped", "Turned off.");
        } else {
            try {
                const bytes = await adapter.readState();
                const buffer = toArrayBuffer(bytes);
                const url = new URL(`/api/games/${gameSlug}/states`, window.location.origin);
                url.searchParams.set("core", core);
                url.searchParams.set("checksum", await sha256Hex(buffer));
                url.searchParams.set("autosave", "true");
                url.searchParams.set("label", "Save & Quit");
                if (adapter.coreName) url.searchParams.set("coreVersion", adapter.coreName);
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "content-type": "application/octet-stream" },
                    body: new Blob([buffer]),
                });
                if (!response.ok) {
                    record("Autosave state", "failed", `The upload returned ${response.status}.`);
                } else {
                    const { stateId } = (await response.json()) as { stateId: string };
                    if (screenshot !== null) {
                        await fetch(`/api/states/${stateId}/screenshot`, {
                            method: "POST",
                            headers: { "content-type": "image/png" },
                            body: new Blob([toArrayBuffer(screenshot)]),
                        }).catch(() => undefined);
                    }
                    record("Autosave state", "ok", "Uploaded.");
                }
            } catch (error) {
                record("Autosave state", "failed", errorMessage(error));
            }
        }
        if (steps.some((step) => step.status === "failed")) {
            record("Play session", "skipped", "Kept open so playtime keeps counting.");
            await adapter.resume();
            setQuitting(false);
            return;
        }
        const session = sessionId.current;
        if (session === null) {
            record("Play session", "skipped", "None was open.");
        } else {
            sessionId.current = null;
            const ended = await fetch(`/api/sessions/${session}/end?reason=save_and_quit`, {
                method: "POST",
            })
                .then((response) => response.ok)
                .catch(() => false);
            if (!ended) sessionId.current = session;
            record("Play session", ended ? "ok" : "skipped", ended ? "Ended." : "Will close when the page unloads.");
        }
        await refreshStates();
        window.location.assign(`/games/${gameSlug}`);
    }
    const chromeVisible = overlayVisible || quitting || statesOpen || state.kind === "quit";
    const controlsBusy = stateBusy || quitting || state.kind === "booting" || state.kind === "restoring";
    return (
        <>
            <div id="emulator" tabIndex={-1} className="h-full w-full outline-none" />
            <div ref={overlayRef} inert={!chromeVisible}
                className={`pointer-events-none absolute inset-x-0 top-0 z-[10000] flex items-start justify-between gap-4 bg-gradient-to-b from-black/70 to-transparent p-4 pb-12 transition-opacity duration-[180ms] sm:p-6 sm:pb-12 ${chromeVisible ? "opacity-100" : "opacity-0"}`}>
                <div className="min-w-0 rounded-md border border-white/10 bg-black/50 px-4 py-3 backdrop-blur-xl">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">{platformName}</p>
                    <p className="mt-1 truncate text-sm font-medium text-white/95">{gameName}</p>
                    {isolated === false ? <p className="mt-1 text-[10px] text-warning">Compatibility mode · single-threaded play</p> : null}
                </div>
                <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-black/50 p-2 pl-4 backdrop-blur-xl pointer-coarse:mr-10">
                    <span className="mr-2 text-xs tabular-nums text-white/60">{clock(elapsed)}</span>
                    <button type="button" onClick={() => void saveAndQuit()} disabled={controlsBusy}
                        className="flex min-h-9 items-center gap-2 rounded-sm bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40">
                        <PlayerIcon name="save" />{quitting ? "Saving…" : "Save & Quit"}
                    </button>
                    <a href={`/games/${gameSlug}`} title="Exit without saving" className="flex min-h-9 items-center gap-2 rounded-sm px-3 text-xs text-white/75 hover:bg-white/10 hover:text-white"><PlayerIcon name="exit" />Exit</a>
                </div>
            </div>
            {state.kind === "synced" ? (
                <div key={state.at.getTime()} className="pointer-events-none absolute right-4 top-28 z-[10002] flex items-center gap-3 rounded-md border border-success/20 bg-surface/95 px-4 py-3 text-sm text-white shadow-xl backdrop-blur-xl"
                    style={{ animation: "saveslot-fade-out 2.6s ease-out forwards" }}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/15 text-success" aria-hidden="true">✓</span>
                    <div><p className="font-medium">{state.message ?? "Progress saved"}</p><p className="mt-0.5 text-xs text-white/45">{state.at.toLocaleTimeString()}</p></div>
                </div>
            ) : null}
            {state.kind === "quit" || state.kind === "failed" || state.kind === "conflict" ? (
                <div aria-live="polite" className="absolute left-1/2 top-28 z-[10001] max-h-[35vh] w-[min(30rem,90vw)] -translate-x-1/2 overflow-auto rounded-lg border border-white/15 bg-elevated/95 p-5 text-sm leading-relaxed text-white/85 shadow-xl backdrop-blur-xl">
                    <StatusLine state={state} />
                </div>
            ) : (
                <div aria-live="polite" className="sr-only"><StatusLine state={state} /></div>
            )}
            {statesOpen ? (
                <div className="absolute inset-0 z-[10003] flex items-center justify-center bg-black/60 p-4"
                    onClick={(event) => { if (event.target === event.currentTarget) setStatesOpen(false); }}>
                    <div id="player-save-states" role="dialog" aria-modal="true" aria-labelledby="player-save-states-title"
                        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setStatesOpen(false); } }}
                        className="max-h-[70vh] w-[min(30rem,100%)] overflow-y-auto rounded-lg border border-white/15 bg-elevated/95 p-4 shadow-xl backdrop-blur-xl">
                        <div className="mb-3 flex items-center justify-between"><h2 id="player-save-states-title" className="text-sm font-semibold text-white">Load a save state</h2><button type="button" onClick={() => setStatesOpen(false)} aria-label="Close save states" className="flex h-11 w-11 items-center justify-center rounded-sm text-white/60 hover:bg-white/10">×</button></div>
                        {states.length === 0 ? <p className="px-1 py-5 text-sm text-white/50">No save states yet. Use Save State to capture one.</p> : (
                            <ul className="space-y-2">
                                {states.map((item) => (
                                    <li key={item.id}>
                                        <button type="button" onClick={() => void loadState(item.id)} disabled={controlsBusy}
                                            className="flex w-full items-center gap-3 rounded-md border border-white/5 bg-white/[.03] p-2.5 text-left text-sm text-white/90 hover:border-accent/40 hover:bg-accent/10 disabled:opacity-40">
                                            {item.hasScreenshot ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={`/api/states/${item.id}/screenshot`} alt="" className="h-14 w-20 shrink-0 rounded-sm object-cover" />
                                            ) : <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-sm bg-white/5 text-white/20"><PlayerIcon name="save" /></span>}
                                            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.label ?? (item.isAutosave ? "Automatic save" : "Manual save")}</span><span className="mt-1 block text-xs text-white/45">{new Date(item.createdAt).toLocaleString()}</span><span className="mt-1 block text-[10px] uppercase tracking-wider text-white/35">{item.isAutosave ? "Auto save" : "Manual save"} · {Math.round(item.byteSize / 1024)} KB</span></span>
                                            <span className="text-accent-hover" aria-hidden="true">▷</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            ) : null}
        </>
    );
}

function PlayerIcon({ name }: { name: "play" | "save" | "load" | "fullscreen" | "exit" }) {
    const paths = {
        play: "m8 5 11 7-11 7V5Z",
        save: "M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8",
        load: "M3 7h6l2 2h10l-3 11H3V7Zm0 0V4h6l2 3h8v2",
        fullscreen: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
        exit: "M9 4H4v16h5m5-13 5 5-5 5M8 12h11",
    };
    return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px] shrink-0" fill={name === "play" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
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
            return <span>{state.message ?? "Progress saved"} · {state.at.toLocaleTimeString()}</span>;
        case "unchanged":
            return <span>No changes since the last save</span>;
        case "idle":
            return <span>{state.message}</span>;
        case "conflict":
            return <span className="text-amber-300">Conflict: {state.message}</span>;
        case "failed":
            return <span className="text-amber-300">{state.message}</span>;
        case "quit":
            return (
                <ul className="space-y-1">
                    {state.steps.map((step) => (
                        <li
                            key={step.label}
                            className={step.status === "failed" ? "text-amber-300" : ""}
                        >
                            <span aria-hidden="true">
                                {step.status === "ok" ? "✓" : step.status === "skipped" ? "–" : "✕"}
                            </span>{" "}
                            {step.label}
                            {step.detail === null ? null : (
                                <span className="text-white/55"> — {step.detail}</span>
                            )}
                        </li>
                    ))}
                    {state.ok ? null : (
                        <li className="mt-2 text-amber-300">
                            Play continues. Use Exit to leave without saving.
                        </li>
                    )}
                </ul>
            );
    }
}
