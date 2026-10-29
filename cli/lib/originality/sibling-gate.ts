// Sibling originality gate for the variant tournament (#561, #421). Wires the
// local fingerprint comparison of `ralphy unit originality` into
// `runTournament`'s injectable `siblingCheck`. Each media file is fingerprinted
// once; a pair is compared in both directions and the stronger verdict wins
// (a short cut-down of a sibling is as much a duplicate as the sibling is of it).

import type { SiblingCheckFn, SiblingCheckOutcome, TournamentCandidate } from "../variant-tournament.js";
import { fingerprintTarget } from "./check.js";
import { compareFingerprints, VERDICT_RANK, type MediaFingerprint } from "./compare.js";
import { pathTarget } from "./targets.js";

export function fingerprintSiblingCheck(): SiblingCheckFn {
  const cache = new Map<string, Promise<MediaFingerprint | { error: string }>>();
  const fingerprint = (candidate: TournamentCandidate) => {
    let pending = cache.get(candidate.mediaPath);
    if (!pending) {
      pending = fingerprintTarget({ ...pathTarget(candidate.mediaPath, "sibling"), label: candidate.variantId });
      cache.set(candidate.mediaPath, pending);
    }
    return pending;
  };
  return async (candidate, sibling) => {
    const [a, b] = await Promise.all([fingerprint(candidate), fingerprint(sibling)]);
    if ("error" in a) return { error: a.error };
    if ("error" in b) return { error: `${sibling.variantId}: ${b.error}` };
    const forward = compareFingerprints(a, b);
    const backward = compareFingerprints(b, a);
    const strongest = VERDICT_RANK[backward.verdict] > VERDICT_RANK[forward.verdict] ? backward : forward;
    if (strongest.axesCompared.length === 0) return null;
    const outcome: SiblingCheckOutcome = {
      verdict: strongest.verdict,
      visual: strongest.visual?.score ?? null,
      audio: strongest.audio?.score ?? null,
      script: strongest.script?.score ?? null,
      reasons: strongest.reasons.join("; "),
    };
    return outcome;
  };
}
