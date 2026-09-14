export interface ProgressBarOptions {
    stream?: { write: (chunk: string) => unknown; isTTY?: boolean };
    width?: number;
    minIntervalMs?: number;
    now?: () => number;
}

export interface ProgressBar {
    render: (label: string, done: number, total: number, force?: boolean) => void;
    finish: () => void;
}

export function createProgressBar(options: ProgressBarOptions = {}): ProgressBar {
    const stream = options.stream ?? process.stdout;
    const width = options.width ?? 28;
    const minIntervalMs = options.minIntervalMs ?? 80;
    const now = options.now ?? (() => Date.now());
    const enabled = stream.isTTY === true;
    let lastAt: number | null = null;
    let dirty = false;
    return {
        render(label, done, total, force = false) {
            if (!enabled) return;
            const at = now();
            if (!force && lastAt !== null && at - lastAt < minIntervalMs) return;
            lastAt = at;

            const ratio = total > 0 ? Math.min(done / total, 1) : 1;
            const filled = Math.round(ratio * width);
            const bar = "#".repeat(filled) + "-".repeat(width - filled);
            const percent = String(Math.round(ratio * 100)).padStart(3);
            stream.write(`\r  ${label.padEnd(10)} [${bar}] ${percent}%  ${done}/${total}    `);
            dirty = true;
        },
        finish() {
            if (enabled && dirty) stream.write("\n");
            dirty = false;
        },
    };
}