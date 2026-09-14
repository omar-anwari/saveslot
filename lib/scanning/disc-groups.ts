import path from "node:path";

export interface DiscMembership {
    groupKey: string;
    title: string;
    discNumber: number;
    isPrimary: boolean;
}

const TAGGED = /^(?<stem>.+?)[\s._-]*[([](?:dis[ck]|cd)\s*(?<disc>\d{1,2})(?:\s*of\s*\d{1,2})?[)\]]$/i;

const TRAILING = /^(?<stem>.+?)(?:[\s._-]+|[\s._-]*(?:cd|disc|disk)\s*)(?<disc>\d{1,2})$/i;

const DISC_EXTENSIONS = new Set([".cue", ".chd", ".iso", ".img", ".ccd", ".bin", ".mdf"]);

interface Candidate {
    relativePath: string;
    stem: string;
    discNumber: number;
    tagged: boolean;
}

function parse(fileName: string): { stem: string; discNumber: number; tagged: boolean } | null {
    const extension = path.extname(fileName);
    const base = fileName.slice(0, fileName.length - extension.length).trim();
    const tagged = TAGGED.exec(base);
    if (tagged?.groups !== undefined) {
        return {
            stem: tagged.groups.stem!.trim(),
            discNumber: Number.parseInt(tagged.groups.disc!, 10),
            tagged: true,
        };
    }
    if (!DISC_EXTENSIONS.has(extension.toLowerCase())) return null;
    const trailing = TRAILING.exec(base);
    if (trailing?.groups === undefined) return null;
    return {
        stem: trailing.groups.stem!.trim(),
        discNumber: Number.parseInt(trailing.groups.disc!, 10),
        tagged: false,
    };
}

const GENERIC_FOLDERS = new Set(["roms", "rom", "games", "game", "disc", "discs", "cd", "iso", "isos"]);

function titleFor(
    key: string,
    members: readonly Candidate[],
    perDirectory: Map<string, number>,
): string {
    const stem = members[0]!.stem.replace(/[\s._-]+$/, "").trim();
    const directory = path.posix.dirname(members[0]!.relativePath);
    if (!directory.includes("/")) return stem;
    if (perDirectory.get(directory) !== members.length) return stem;
    const folder = path.posix.basename(directory).trim();
    if (folder.length === 0 || GENERIC_FOLDERS.has(folder.toLowerCase())) return stem;
    if (members.some((member) => path.posix.dirname(member.relativePath) !== directory)) return stem;
    return folder;
}

export function detectDiscGroups(
    files: readonly { relativePath: string; fileName: string }[],
): Map<string, DiscMembership> {
    const byKey = new Map<string, Candidate[]>();
    const perDirectory = new Map<string, number>();
    for (const file of files) {
        const directory = path.posix.dirname(file.relativePath);
        perDirectory.set(directory, (perDirectory.get(directory) ?? 0) + 1);
    }
    for (const file of files) {
        const parsed = parse(file.fileName);
        if (parsed === null || parsed.stem.length === 0) continue;
        const key = `${path.posix.dirname(file.relativePath).toLowerCase()}\u0000${parsed.stem.toLowerCase()}`;
        const bucket = byKey.get(key);
        const candidate: Candidate = { relativePath: file.relativePath, ...parsed };
        if (bucket === undefined) byKey.set(key, [candidate]);
        else bucket.push(candidate);
    }
    const memberships = new Map<string, DiscMembership>();
    for (const [key, members] of byKey) {
        if (members.length < 2) continue;
        const numbers = members.map((member) => member.discNumber).sort((a, b) => a - b);
        const distinct = new Set(numbers).size === numbers.length;
        const contiguous = numbers[0] === 1 && numbers[numbers.length - 1] === numbers.length;
        if (!distinct || !contiguous) continue;
        const lowest = numbers[0]!;
        const title = titleFor(key, members, perDirectory);
        for (const member of members) {
            memberships.set(member.relativePath, {
                groupKey: key,
                title,
                discNumber: member.discNumber,
                isPrimary: member.discNumber === lowest,
            });
        }
    }
    return memberships;
}