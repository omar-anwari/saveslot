"use client";

import { useEffect, useState } from "react";

interface Controller {
    index: number;
    name: string;
    mapping: string;
    buttons: boolean[];
}

function ControllerDrawing({ active = false }: { active?: boolean }) {
    return (
        <svg viewBox="0 0 180 110" fill="none" aria-hidden="true" className={`h-24 w-40 ${active ? "text-accent-hover" : "text-subtle"}`}>
            <path d="M48 25h84c15 0 22 15 27 35l4 20c3 16-10 23-21 12l-21-20H59L38 92C27 103 14 96 17 80l4-20c5-20 12-35 27-35Z" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="2" />
            <path d="M50 39v24M38 51h24" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
            <circle cx="133" cy="41" r="4" fill="currentColor" /><circle cx="144" cy="52" r="4" fill="currentColor" /><circle cx="122" cy="52" r="4" fill="currentColor" /><circle cx="133" cy="63" r="4" fill="currentColor" />
            <circle cx="72" cy="67" r="9" stroke="currentColor" strokeWidth="2" /><circle cx="107" cy="67" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M79 45h5m11 0h5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
    );
}

export function ControllersPanel() {
    const [controllers, setControllers] = useState<Controller[]>([]);
    const [unavailable, setUnavailable] = useState(false);
    useEffect(() => {
        function read() {
            try {
                if (!navigator.getGamepads) { setUnavailable(true); return; }
                setControllers(Array.from(navigator.getGamepads()).flatMap((pad) => pad?.connected ? [{
                    index: pad.index, name: pad.id, mapping: pad.mapping,
                    buttons: pad.buttons.map((button) => button.pressed),
                }] : []));
            } catch { setUnavailable(true); }
        }
        read();
        const timer = window.setInterval(read, 150);
        window.addEventListener("gamepadconnected", read);
        window.addEventListener("gamepaddisconnected", read);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("gamepadconnected", read);
            window.removeEventListener("gamepaddisconnected", read);
        };
    }, []);

    return (
        <section>
            <div className="mb-6">
                <h2 className="text-xl font-semibold tracking-tight">Controller setup</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Connect a controller and press a button to let your browser detect it. Configure button mappings from the controls menu while a game is running.</p>
            </div>
            {unavailable ? <p role="status" className="mb-5 rounded-md border border-warning/20 bg-warning/5 p-4 text-sm text-warning">This browser cannot access controllers. Try a browser with gamepad support.</p> : null}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: Math.max(4, controllers.length) }, (_, index) => {
                    const pad = controllers[index];
                    return (
                        <div key={index} className={`rounded-lg border bg-surface p-5 ${pad ? "border-accent/30" : "border-line"}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">Player {index + 1}</span>
                                <span className={`h-2 w-2 rounded-full ${pad ? "bg-success" : "bg-subtle/40"}`} />
                            </div>
                            <div className="my-5 flex justify-center"><ControllerDrawing active={Boolean(pad)} /></div>
                            <p className={`text-xs font-medium ${pad ? "text-success" : "text-subtle"}`}>{pad ? "Connected" : "Not connected"}</p>
                            <p className="mt-2 min-h-10 break-words text-sm leading-5 text-muted">{pad?.name ?? "Waiting for a controller"}</p>
                            {pad ? <p className="mt-3 text-xs text-subtle">{pad.mapping === "standard" ? "Standard button layout" : "Device button layout"}</p> : null}
                        </div>
                    );
                })}
            </div>
            {controllers.length > 0 ? (
                <div className="mt-6 rounded-lg border border-line bg-surface p-6">
                    <h3 className="font-medium">Test your buttons</h3>
                    <p className="mt-1 text-sm text-muted">Press a button on your controller to see its input light up.</p>
                    {controllers.map((pad) => (
                        <div key={pad.index} className="mt-5">
                            <p className="mb-3 text-xs text-muted">{pad.name}</p>
                            <div className="flex flex-wrap gap-2">{pad.buttons.map((pressed, index) => (
                                <span key={index} aria-label={`Button ${index + 1}${pressed ? " pressed" : ""}`} className={`flex h-9 w-9 items-center justify-center rounded-sm border text-xs tabular-nums ${pressed ? "border-accent bg-accent text-white" : "border-line bg-elevated text-subtle"}`}>{index + 1}</span>
                            ))}</div>
                        </div>
                    ))}
                </div>
            ) : null}
        </section>
    );
}
