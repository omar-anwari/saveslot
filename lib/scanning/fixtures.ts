import { open } from "node:fs/promises";

export const FIXTURE_MAGIC = "SAVESLOT-FIXTURE-V1\n";

const MAGIC_BYTES = new TextEncoder().encode(FIXTURE_MAGIC);

export async function isFixtureFile(absolutePath: string): Promise<boolean> {
    let handle;
    try {
        handle = await open(absolutePath, "r");
    } catch {
        return false;
    }
    try {
        const header = Buffer.alloc(MAGIC_BYTES.length);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        if (bytesRead < MAGIC_BYTES.length) return false;
        return header.equals(Buffer.from(MAGIC_BYTES));
    } catch {
        return false;
    } finally {
        await handle.close();
    }
}

export function fixtureContent(note: string, sizeBytes = 32 * 1024): Uint8Array {
    const preamble = new TextEncoder().encode(
        `${FIXTURE_MAGIC}${note}\nThis is not a playable ROM.\n`,
    );
    const buffer = new Uint8Array(Math.max(sizeBytes, preamble.length));
    buffer.set(preamble);
    for (let i = preamble.length; i < buffer.length; i += 1) {
        buffer[i] = i % 251;
    }
    return buffer;
}