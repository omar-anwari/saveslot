import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { E2E_ENV, E2E_GAMES, E2E_ROOT } from "./env.ts";

function nesRom(seed: number): Uint8Array {
    const prgSize = 16 * 1024;
    const rom = new Uint8Array(16 + prgSize + 8 * 1024);
    rom.set([0x4e, 0x45, 0x53, 0x1a, 1, 1, 0, 0]);
    const prg = 16;
    rom.set([0x78, 0xd8, 0x4c, 0x02, 0xc0, 0x40], prg);
    rom[prg + 0x100] = seed;
    rom.set([0x05, 0xc0, 0x00, 0xc0, 0x05, 0xc0], prg + prgSize - 6);
    return rom;
}

if (path.basename(E2E_ROOT) !== ".e2e") throw new Error(`Refusing to clear ${E2E_ROOT}`);
await rm(E2E_ROOT, { recursive: true, force: true });

const env = { ...process.env, ...E2E_ENV };
const run = (script: string) =>
    execFileSync(process.execPath, ["--conditions=react-server", script], { env, stdio: "inherit" });

run("scripts/setup-local.ts");
const nes = path.join(E2E_ROOT, "library", "nes");
await mkdir(nes, { recursive: true });
for (const [index, game] of E2E_GAMES.entries()) {
    await writeFile(path.join(nes, game.file), nesRom(index + 1));
}
run("scripts/scan.ts");