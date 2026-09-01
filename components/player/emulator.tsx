"use client";
import { useEffect, useRef } from "react";

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

export interface EmulatorProps {
    gameId: number;
    gameName: string;
    core: string;
    contentUrl: string;
    dataPath: string;
    threads: "auto" | "on" | "off";
}

export function Emulator({
    gameId,
    gameName,
    core,
    contentUrl,
    dataPath,
    threads,
}: EmulatorProps) {
    const started = useRef(false);
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
    return <div id="emulator" className="h-dvh w-dvw" />;
}