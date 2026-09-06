import type { MatchReason } from "./types.ts";

export const TITLE_MATCH_MIN_SCORE = 0.8;
export const TITLE_MATCH_MIN_MARGIN = 0.1;

const ROMAN: ReadonlyMap<string, string> = new Map([
    ["i", "1"], ["ii", "2"], ["iii", "3"], ["iv", "4"], ["v", "5"],
    ["vi", "6"], ["vii", "7"], ["viii", "8"], ["ix", "9"], ["x", "10"],
]);

export function comparableTitle(raw: string): string {
    let value = raw.toLowerCase();
    value = value.replace(/[([{][^)\]}]*[)\]}]/g, " ");
    value = value.replace(/,\s*(the|an|a)\b/g, " ");
    value = value.replace(/[^a-z0-9]+/g, " ").trim();
    value = value.replace(/^(the|an|a)\s+/, "");
    value = value
        .split(" ")
        .map((token) => ROMAN.get(token) ?? token)
        .join(" ");
    value = value.replace(/\s+(rev|revision|v)\s*\d+(\s+\d+)*$/, "");
    return value.replace(/\s+/g, " ").trim();
}

export function searchableTitle(raw: string): string {
    return raw
        .replace(/[([{][^)\]}]*[)\]}]/g, " ")
        .replace(/\s+(rev|revision|v)\s*\d+(\.\d+)*\s*$/i, "")
        .replace(/\s+/g, " ")
        .replace(/[-–—:,\s]+$/, "")
        .trim();
}

function bigrams(value: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (let index = 0; index + 1 < value.length; index += 1) {
        const pair = value.slice(index, index + 2);
        counts.set(pair, (counts.get(pair) ?? 0) + 1);
    }
    return counts;
}

export function titleSimilarity(left: string, right: string): number {
    const a = comparableTitle(left);
    const b = comparableTitle(right);
    if (a.length === 0 || b.length === 0) return 0;
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const first = bigrams(a);
    const second = bigrams(b);
    let shared = 0;
    let totalFirst = 0;
    let totalSecond = 0;
    for (const count of first.values()) totalFirst += count;
    for (const [pair, count] of second) {
        totalSecond += count;
        shared += Math.min(count, first.get(pair) ?? 0);
    }
    return (2 * shared) / (totalFirst + totalSecond);
}

export interface TitleMatchInput {
    wantedTitle: string;
    candidateTitle: string;
    wantedYear: number | null;
    candidateYear: number | null;
}

export interface TitleMatchScore {
    score: number;
    similarity: number;
    reasons: MatchReason[];
}

export function scoreTitleMatch(input: TitleMatchInput): TitleMatchScore {
    const reasons: MatchReason[] = [];
    const similarity = titleSimilarity(input.wantedTitle, input.candidateTitle);
    const exact =
        comparableTitle(input.wantedTitle) === comparableTitle(input.candidateTitle) &&
        comparableTitle(input.wantedTitle).length > 0;
    let score = 0;
    if (exact) {
        score += 0.65;
        reasons.push({ code: "title.exact", delta: 0.65, detail: "Normalized titles are identical." });
    } else if (similarity >= 0.85) {
        score += 0.45;
        reasons.push({ code: "title.close", delta: 0.45, detail: `Titles are ${(similarity * 100).toFixed(0)}% similar.` });
    } else if (similarity >= 0.6) {
        score += 0.25;
        reasons.push({ code: "title.weak", delta: 0.25, detail: `Titles are only ${(similarity * 100).toFixed(0)}% similar.` });
    } else {
        reasons.push({ code: "title.unrelated", delta: 0, detail: `Titles are ${(similarity * 100).toFixed(0)}% similar.` });
        return { score: 0, similarity, reasons };
    }
    const fuzzy = Number((similarity * 0.2).toFixed(4));
    score += fuzzy;
    reasons.push({ code: "title.similarity", delta: fuzzy, detail: `Similarity ${(similarity * 100).toFixed(0)}%.` });
    if (input.wantedYear !== null && input.candidateYear !== null) {
        const gap = Math.abs(input.wantedYear - input.candidateYear);
        if (gap === 0) {
            score += 0.1;
            reasons.push({ code: "year.exact", delta: 0.1, detail: `Both say ${input.candidateYear}.` });
        } else if (gap === 1) {
            score += 0.05;
            reasons.push({ code: "year.near", delta: 0.05, detail: `${input.wantedYear} vs ${input.candidateYear}.` });
        } else {
            score -= 0.1;
            reasons.push({ code: "year.conflict", delta: -0.1, detail: `${input.wantedYear} vs ${input.candidateYear}.` });
        }
    }
    return { score: Math.max(0, Math.min(1, Number(score.toFixed(4)))), similarity, reasons };
}

export function chooseBest<T>(
    scored: readonly { item: T; score: number }[],
): { item: T; score: number; rejected: string | null } | null {
    if (scored.length === 0) return null;
    const ranked = [...scored].sort((a, b) => b.score - a.score);
    const best = ranked[0]!;
    const runnerUp = ranked[1];
    if (best.score < TITLE_MATCH_MIN_SCORE) {
        return { ...best, rejected: `Best score ${best.score.toFixed(2)} is below ${TITLE_MATCH_MIN_SCORE}.` };
    }
    if (runnerUp !== undefined && best.score - runnerUp.score < TITLE_MATCH_MIN_MARGIN) {
        return {
            ...best,
            rejected: `Too close to call: ${best.score.toFixed(2)} vs ${runnerUp.score.toFixed(2)}.`,
        };
    }
    return { ...best, rejected: null };
}