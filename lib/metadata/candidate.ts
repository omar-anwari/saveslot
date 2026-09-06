import type { MetadataCandidate, NormalizedGameMetadata } from "./types.ts";

export interface EnrichmentCandidateInput {
    providerKey: string;
    providerGameId: string;
    metadata: NormalizedGameMetadata;
    platformSlug: string;
    inheritedScore: number;
    identityProviderKey: string;
    identityDetail: string;
}

export function enrichmentCandidate(input: EnrichmentCandidateInput): MetadataCandidate {
    const known = input.metadata.platformSlugs;
    const agrees = known.includes(input.platformSlug);
    const unknown = known.length === 0;
    const reasons = [
        {
            code: "identity.inherited",
            delta: input.inheritedScore,
            detail: input.identityDetail,
        },
    ];
    if (agrees) {
        reasons.push({
            code: "platform.member",
            delta: 0,
            detail: `Released on ${input.platformSlug}${known.length > 1 ? ` (of ${known.length} known platforms)` : ""}.`,
        });
    } else if (unknown) {
        reasons.push({
            code: "platform.unknown",
            delta: 0,
            detail: "Lists no platform we support; relying on the hash match.",
        });
    } else {
        reasons.push({
            code: "platform.mismatch",
            delta: -1,
            detail: `Lists ${known.join(", ")}, not ${input.platformSlug}.`,
        });
    }
    return {
        providerKey: input.providerKey,
        providerGameId: input.providerGameId,
        score: agrees || unknown ? input.inheritedScore : 0,
        matchType: "title",
        reasons,
        platformSlug: agrees || unknown ? input.platformSlug : null,
        metadata: input.metadata,
    };
}