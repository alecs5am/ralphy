// Cross-batch structural similarity gate (#529).
//
// The GATE-TIME half of batch variance (the PLAN-TIME half is variance-pools.ts).
// Given the produced units of a batch (each a title + body text + a length), it
// measures how much the batch looks like one template stamped N times:
//
//   • opening n-gram overlap — shared first-K-word shingles across items,
//   • section-skeleton hash   — items whose heading skeleton is byte-identical,
//   • length-distribution clustering — items whose length sits within a tight
//     band of many siblings (a batch all clustered within seconds/words).
//
// Items above the configured similarity threshold FAIL with a concrete "vary X"
// finding in the #409 repair vocabulary. Category routing (confirmed against
// cli/lib/repair.ts): `structure.batch-variance` → scenarist (article/script
// prose + skeleton), `captions.batch-variance` → editor (caption-formula
// clustering). Length clustering rides the structure category (a script/plan
// decision the scenarist owns).
//
// PURE + deterministic, no LLM, no disk. English-only-on-disk.

import type { Finding, Severity } from "./types.js";

// ─── Item + config shapes ──────────────────────────────────────────────────────

/** One produced batch unit's textual signal. `captionFormula` is the stamped
 *  plan value (variance-pools.ts) when known — clustering on it is the caption
 *  half of the gate. All fields optional-ish: a missing body just scores empty. */
export interface BatchUnitInput {
  /** Stable id (project/slug or cell id) — named in findings. */
  id: string;
  /** The unit's primary text (article body, script, or concatenated captions). */
  text: string;
  /** Optional heading/section labels in order (for the skeleton hash). Derived
   *  from markdown headings when omitted. */
  sections?: string[];
  /** The caption formula this unit used (from the stamped profile), for caption clustering. */
  captionFormula?: string;
}

export interface BatchVarianceThresholds {
  /** Shared opening-shingle Jaccard above which two items count as "same opener" (0-1, default 0.6). */
  openingOverlap?: number;
  /** How many opening words form the shingle set (default 8). */
  openingWords?: number;
  /** Fraction of the batch an item may share a skeleton hash with before it fails (0-1, default 0.5). */
  maxSkeletonShare?: number;
  /** Length band (fraction of the batch mean) inside which lengths are "clustered" (default 0.08 = ±8%). */
  lengthBandPct?: number;
  /** Fraction of the batch that may fall in one length band before it warns (0-1, default 0.6). */
  maxLengthClusterShare?: number;
  /** Fraction of the batch that may share one caption formula before it warns (0-1, default 0.6). */
  maxCaptionShare?: number;
}

const DEFAULTS: Required<BatchVarianceThresholds> = {
  openingOverlap: 0.6,
  openingWords: 8,
  maxSkeletonShare: 0.5,
  lengthBandPct: 0.08,
  maxLengthClusterShare: 0.6,
  maxCaptionShare: 0.6,
};

// ─── Text helpers ──────────────────────────────────────────────────────────────

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []);
}

/** The set of the first `n` words of a text (an opening shingle set). */
function openingSet(text: string, n: number): Set<string> {
  return new Set(words(text).slice(0, n));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Markdown ATX headings in order, lowercased + trimmed. */
function headingsOf(text: string): string[] {
  return (text.match(/^#{1,6}\s+(.+)$/gm) ?? []).map((h) =>
    h.replace(/^#{1,6}\s+/, "").trim().toLowerCase(),
  );
}

/** A stable skeleton hash of a section label list (order-sensitive). */
function skeletonHash(sections: string[]): string {
  const spine = sections.map((s) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase()).join("|");
  let h = 2166136261;
  for (let i = 0; i < spine.length; i++) {
    h ^= spine.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ─── Finding helper ──────────────────────────────────────────────────────────

let _bid = 0;
function mkFinding(category: string, severity: Severity, message: string, fixHint: string): Finding {
  _bid += 1;
  return {
    id: `BV${_bid}`,
    category,
    severity,
    sceneIndex: null,
    timestampSec: null,
    message,
    fixHint,
    fixCommand: null,
  };
}

// ─── The gate ──────────────────────────────────────────────────────────────────

export interface BatchVarianceResult {
  findings: Finding[];
  /** Per-metric roll-up (surfaced for the report, not the verdict). */
  metrics: {
    items: number;
    maxOpeningOverlap: number;
    identicalSkeletonGroups: number;
    largestLengthClusterShare: number;
    largestCaptionShare: number;
  };
}

/**
 * Score a batch's structural similarity. A batch of < 2 items can't cluster —
 * returns an empty result. Every threshold is read from `thresholds` with a
 * documented default. Items that exceed a bar get a concrete "vary X" finding.
 */
export function scoreBatchVariance(
  units: BatchUnitInput[],
  thresholds: BatchVarianceThresholds = {},
): BatchVarianceResult {
  const t = { ...DEFAULTS, ...thresholds };
  const n = units.length;
  const empty: BatchVarianceResult = {
    findings: [],
    metrics: { items: n, maxOpeningOverlap: 0, identicalSkeletonGroups: 0, largestLengthClusterShare: 0, largestCaptionShare: 0 },
  };
  if (n < 2) return empty;

  const findings: Finding[] = [];

  // — 1. Opening n-gram overlap: flag any PAIR whose opener Jaccard ≥ bar.
  const openings = units.map((u) => openingSet(u.text, t.openingWords));
  let maxOverlap = 0;
  const flaggedOpeners = new Set<string>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = jaccard(openings[i]!, openings[j]!);
      if (sim > maxOverlap) maxOverlap = sim;
      if (sim >= t.openingOverlap) {
        flaggedOpeners.add(units[i]!.id);
        flaggedOpeners.add(units[j]!.id);
      }
    }
  }
  for (const id of flaggedOpeners) {
    findings.push(
      mkFinding(
        "structure.batch-variance",
        "fail",
        `Item "${id}" opens with nearly the same words as another batch item (opening-shingle overlap ≥ ${Math.round(t.openingOverlap * 100)}%). A batch of identical openers reads as one template stamped N times.`,
        "Vary the HOOK: assign this item a different hookType from the rotation pool (question / stat-shock / cold-open / contrarian) so its first line is distinct.",
      ),
    );
  }

  // — 2. Section-skeleton hash: flag items sharing a skeleton with too many siblings.
  const hashes = units.map((u) => skeletonHash(u.sections ?? headingsOf(u.text)));
  const byHash = new Map<string, string[]>();
  for (let i = 0; i < n; i++) {
    const arr = byHash.get(hashes[i]!) ?? [];
    arr.push(units[i]!.id);
    byHash.set(hashes[i]!, arr);
  }
  let identicalGroups = 0;
  for (const [, ids] of byHash) {
    if (ids.length < 2) continue;
    const share = ids.length / n;
    if (share > t.maxSkeletonShare) {
      identicalGroups += 1;
      for (const id of ids) {
        findings.push(
          mkFinding(
            "structure.batch-variance",
            "fail",
            `Item "${id}" shares an identical section skeleton with ${ids.length - 1} other item(s) (${Math.round(share * 100)}% of the batch, over the ${Math.round(t.maxSkeletonShare * 100)}% bar).`,
            "Vary the SECTION ORDER: assign a different sectionOrder permutation from the pool so the heading skeleton differs across items.",
          ),
        );
      }
    }
  }

  // — 3. Length-distribution clustering: warn when too many lengths sit in one band.
  const lengths = units.map((u) => words(u.text).length);
  const mean = lengths.reduce((s, x) => s + x, 0) / n;
  const band = mean * t.lengthBandPct;
  let largestCluster = 0;
  for (const center of lengths) {
    const inBand = lengths.filter((l) => Math.abs(l - center) <= band).length;
    if (inBand > largestCluster) largestCluster = inBand;
  }
  const lengthClusterShare = largestCluster / n;
  if (lengthClusterShare > t.maxLengthClusterShare && mean > 0) {
    findings.push(
      mkFinding(
        "structure.batch-variance",
        "warn",
        `Lengths are clustered: ${largestCluster}/${n} items (${Math.round(lengthClusterShare * 100)}%) fall within ±${Math.round(t.lengthBandPct * 100)}% of the batch mean (${Math.round(mean)} words). A uniform length across a batch is a template fingerprint.`,
        "Vary the TARGET LENGTH: sample each item's length from a range (variance-pools targetLength) instead of a constant, so the batch spreads across the length window.",
      ),
    );
  }

  // — 4. Caption-formula clustering (EDITOR-owned): warn when one formula dominates.
  const withCap = units.filter((u) => (u.captionFormula ?? "").trim().length > 0);
  let largestCapShare = 0;
  if (withCap.length >= 2) {
    const byFormula = new Map<string, number>();
    for (const u of withCap) {
      const f = u.captionFormula!.trim().toLowerCase();
      byFormula.set(f, (byFormula.get(f) ?? 0) + 1);
    }
    for (const [formula, cnt] of byFormula) {
      const share = cnt / withCap.length;
      if (share > largestCapShare) largestCapShare = share;
      if (share > t.maxCaptionShare) {
        findings.push(
          mkFinding(
            "captions.batch-variance",
            "warn",
            `Caption formula "${formula}" is used by ${cnt}/${withCap.length} items (${Math.round(share * 100)}%, over the ${Math.round(t.maxCaptionShare * 100)}% bar) — the whole batch captions the same way.`,
            "Vary the CAPTION FORMULA across items (word-by-word / phrase-chunks / keyword-punch / full-line) so the caption treatment is not uniform.",
          ),
        );
      }
    }
  }

  return {
    findings,
    metrics: {
      items: n,
      maxOpeningOverlap: Number(maxOverlap.toFixed(3)),
      identicalSkeletonGroups: identicalGroups,
      largestLengthClusterShare: Number(lengthClusterShare.toFixed(3)),
      largestCaptionShare: Number(largestCapShare.toFixed(3)),
    },
  };
}
