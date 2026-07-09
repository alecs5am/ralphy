// Performance-driven selection weights (#532, FOUNDATION layer) — attribute
// measured audience outcomes (#507 analytics.jsonl) back to the choice
// dimensions recorded on each unit TODAY, and expose the bias-sampling seam
// the variance planner (#529) and campaign picker (#528) will consult once
// they exist. Those two consumers are NOT built yet: this module is
// dependency-free and stops at `sampleWeighted`, the pure sampling primitive
// they will call — see the SAMPLING SEAM section below.
//
// HONEST-METRICS RULE (the issue's hard clause, #532 notes): every weight comes
// from a MEASURED metric on a real snapshot. No proxy signals, no assumed
// indexing, and — critically — no overfitting: a dimension value seen once
// (n=1) gets WIDE confidence and a LOW effective weight, never a confident
// verdict. Cold-start (no analytics anywhere) yields empty/uniform weights and
// `sampleWeighted` degrades to uniform random — the farm behaves EXACTLY like
// today until data accrues.
//
// Storage mirrors the trust.ts pattern (per-workspace, append-only JSONL):
//   • <workspace>/selection-weights.jsonl — APPEND-ONLY history of recomputes.
//     Each line is one full recompute snapshot; `readLatestWeights` returns the
//     newest. Never rewritten (invariant #14).
//   • the pin/retire lifecycle rides the shared <workspace>/lifecycle.jsonl
//     (bundle.ts `lifecycleLogPath`) — reversible, human-visible actions.
//
// #483 tie-in (do NOT build here): calibration asks "does the eval score predict
// real performance?". These weights are the real-performance side of that
// question; wiring the two is #483's job, not this module's.

import fs from "node:fs";
import path from "node:path";
import { workspaceDir, projectWorkspace } from "./paths.js";
import { lifecycleLogPath } from "./bundle.js";
import { listUnitSlugs, readSnapshots } from "./analytics/pull.js";
import { unitDirFor } from "./publish/publish.js";
import type { AnalyticsSnapshot } from "./schemas/analytics.js";
import type { Prng } from "./farm/prng.js";
import { makePrng } from "./farm/prng.js";

// ─── tunables (documented, exported so tests + consumers pin the same values) ─

/**
 * Time decay: a snapshot's contribution halves every this-many days. Old wins
 * fade so the farm tracks a moving audience, not a frozen one. Applied per
 * snapshot on its recency vs `now` (exponential half-life).
 */
export const DECAY_HALFLIFE_DAYS = 45;

/**
 * Default exploration floor for `sampleWeighted`: every candidate keeps at
 * least this share of the probability mass so nothing is ever fully starved
 * (the issue's "weights BIAS, never hard-exclude" rule). 0.1 = 10% of every
 * draw is spread uniformly across all candidates regardless of weight.
 */
export const DEFAULT_EPSILON = 0.1;

/**
 * Confidence ramp: how many decayed samples a (dimension, value) needs before
 * its score is trusted at full strength. Below this, the effective weight is
 * pulled toward the neutral baseline (Bayesian-style shrinkage) so n=1 never
 * dominates. Chosen small (real per-post analytics are scarce) but > 1.
 */
export const CONFIDENCE_FULL_AT = 5;

/** A pinned value's minimum weight floor (fraction of the max live weight). */
export const PIN_FLOOR = 0.5;

/** A retired value's weight multiplier — down-weighted, NOT hard-excluded. */
export const RETIRE_MULTIPLIER = 0.1;

/**
 * The dimensions we attribute over. The first block is recorded on unit.json /
 * analytics from the FOUNDATION layer (template/style/recipe/asset from the
 * unit's provenance, platform/postingWindow from its publish records). The
 * second block (#532 wiring) is the four creative-choice axes the campaign
 * picker (#528) and variance planner (#529) select over — stamped onto a
 * produced unit's provenance at production time:
 *   • hookType   — the variance profile's opener shape (from the format's pool).
 *   • lengthBand — a coarse bucket of the profile's sampled target length
 *                  (short/medium/long — see `lengthBand()`); the raw seconds/
 *                  words value is too granular to accrue weight, the band is not.
 *   • angle      — the campaign cell's creative angle (its hook brief).
 *   • thesis     — the campaign cell's thesis id (the strategic line it advances).
 *   • format     — the media format (video | article | carousel | …).
 * A unit that never went through a campaign/variance flow simply carries none of
 * the second block — those observations are absent, not fabricated.
 */
export const SELECTION_DIMENSIONS = [
  "template",
  "style",
  "recipe",
  "asset",
  "platform",
  "postingWindow",
  "hookType",
  "lengthBand",
  "angle",
  "thesis",
  "format",
] as const;
export type SelectionDimension = (typeof SELECTION_DIMENSIONS)[number];

const DAY_MS = 86_400_000;

// ─── length-band bucketing (pure + deterministic) ────────────────────────────

/** The three coarse length buckets a variance profile's target length maps to. */
export type LengthBand = "short" | "medium" | "long";

/**
 * Bucket a variance profile's target length into a coarse band. Pure +
 * deterministic — the same (length, unit) always yields the same band, so a
 * produced unit's stamped band and the planner's candidate band agree.
 *
 * Thresholds mirror the natural break points of the format pools in
 * `cli/lib/eval/variance-pools.ts`:
 *   • seconds (video/short): ≤20s short, ≤40s medium, else long — the SHORT_POOL
 *     range [8,30] and VIDEO_POOL range [18,55] straddle these breaks.
 *   • words (article/still): ≤900 short, ≤1600 medium, else long — the
 *     ARTICLE_POOL range [700,2200] spans all three; the STILL_POOL headline
 *     budget [1,8] always lands "short", which is correct (a slide headline is
 *     never "long-form").
 */
export function lengthBand(targetLength: number, unit: "words" | "seconds"): LengthBand {
  if (unit === "seconds") {
    if (targetLength <= 20) return "short";
    if (targetLength <= 40) return "medium";
    return "long";
  }
  // words
  if (targetLength <= 900) return "short";
  if (targetLength <= 1600) return "medium";
  return "long";
}

// ─── outcome score (the honest blend) ────────────────────────────────────────

/**
 * Normalize one snapshot's metrics into a single raw outcome score in [0, 1+].
 * BLEND (documented): a weighted mix of the four measured signals the #507
 * schema carries, each min-max normalized WITHIN the workspace (see
 * `normalizeWithin`) so a high-view platform never swamps a high-retention one:
 *   • views      0.35  (reach)
 *   • retention  0.35  (avgViewDurationSec, or the mean watchRatio of the
 *                       retention curve when duration is absent)
 *   • ctr        0.15
 *   • saves      0.15  (likes + shares — the closest "saved/valued" proxy the
 *                       schema exposes; still a MEASURED metric, not assumed)
 * A metric absent from a snapshot contributes nothing (its weight is dropped
 * and the remaining weights renormalize) — never a fabricated zero.
 */
const BLEND: Record<string, number> = { views: 0.35, retention: 0.35, ctr: 0.15, saves: 0.15 };

/** The four raw signals pulled out of one snapshot (undefined = not reported). */
interface RawSignals {
  views?: number;
  retention?: number;
  ctr?: number;
  saves?: number;
}

function rawSignals(s: AnalyticsSnapshot): RawSignals {
  const m = s.metrics;
  const out: RawSignals = {};
  if (typeof m.views === "number") out.views = m.views;
  if (typeof m.avgViewDurationSec === "number") {
    out.retention = m.avgViewDurationSec;
  } else if (Array.isArray(m.retentionCurve) && m.retentionCurve.length > 0) {
    const rs = m.retentionCurve.map((p) => (typeof p.watchRatio === "number" ? p.watchRatio : 0));
    out.retention = rs.reduce((a, b) => a + b, 0) / rs.length;
  }
  if (typeof m.ctr === "number") out.ctr = m.ctr;
  const likes = typeof m.likes === "number" ? m.likes : 0;
  const shares = typeof m.shares === "number" ? m.shares : 0;
  if (likes + shares > 0) out.saves = likes + shares;
  return out;
}

/** Min-max normalize a value within [min,max] → [0,1]; degenerate range → 0.5. */
function normalizeWithin(v: number, min: number, max: number): number {
  if (!(max > min)) return 0.5; // single distinct value — neutral, no false signal
  return (v - min) / (max - min);
}

// ─── attribution ─────────────────────────────────────────────────────────────

/** One measured observation: a (dimension,value) tag on a unit + its snapshot. */
interface Observation {
  dimension: SelectionDimension;
  value: string;
  raw: RawSignals;
  /** Age of the snapshot in days vs `now` (for decay). */
  ageDays: number;
}

/** Hour-of-day bucket ("00"-"23") from a publish record's scheduleAt / at. */
export function postingWindowBucket(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return String(new Date(t).getUTCHours()).padStart(2, "0");
}

/** The (dimension,value) tags a unit's provenance + publish records expose. */
function unitTags(meta: Record<string, unknown>): Array<{ dimension: SelectionDimension; value: string }> {
  const tags: Array<{ dimension: SelectionDimension; value: string }> = [];
  const prov = (meta.provenance ?? {}) as Record<string, unknown>;
  if (typeof prov.template === "string") tags.push({ dimension: "template", value: prov.template });
  if (typeof prov.style === "string") tags.push({ dimension: "style", value: prov.style });
  for (const r of Array.isArray(prov.recipes) ? prov.recipes : []) {
    if (typeof r === "string") tags.push({ dimension: "recipe", value: r });
  }
  for (const a of Array.isArray(prov.assets) ? prov.assets : []) {
    if (typeof a === "string") tags.push({ dimension: "asset", value: a });
  }
  // #532 creative-choice axes — stamped onto provenance.selection at production
  // time by the campaign picker + variance planner (cli/lib/unit.ts
  // `applySelectionProvenance`). Emitted exactly like the block above so
  // analytics join back to what the pickers actually chose. Absent when a unit
  // never went through those flows — no fabricated observation.
  const sel = (prov.selection ?? {}) as Record<string, unknown>;
  for (const dim of ["hookType", "lengthBand", "angle", "thesis", "format"] as const) {
    const v = sel[dim];
    if (typeof v === "string" && v.length > 0) tags.push({ dimension: dim, value: v });
  }
  // `format` also lives at the manifest top level (unit.json.format); fall back
  // to it when the selection block did not carry one.
  if (!sel.format && typeof meta.format === "string") tags.push({ dimension: "format", value: meta.format });
  return tags;
}

export interface WeightEntry {
  dimension: SelectionDimension;
  value: string;
  /** Normalized outcome score in [0,1] — decayed-mean of the blended metric. */
  score: number;
  /** Number of contributing snapshots (raw, undecayed count). */
  sampleSize: number;
  /** Confidence in [0,1] — ramps to 1 as decayed weight reaches CONFIDENCE_FULL_AT. */
  confidence: number;
  /** Effective weight the sampler biases on: score shrunk toward baseline by confidence. */
  weight: number;
  lastUpdated: string;
}

export interface WeightsSnapshot {
  workspace: string;
  computedAt: string;
  /** Total units scanned / total that carried ≥1 usable snapshot. */
  units: { scanned: number; withAnalytics: number };
  halfLifeDays: number;
  entries: WeightEntry[];
  /** True when nothing measurable existed — sampler must degrade to uniform. */
  coldStart: boolean;
}

/**
 * Gather every measured observation across a workspace's units. Reuses the
 * per-project #507 readers (`listUnitSlugs` / `readSnapshots`) so there is ONE
 * analytics reader in the tree. `projectWorkspace` maps each project id back to
 * `ws`, so a project registered under `ws` is only counted for `ws`.
 */
function gatherObservations(
  ws: string,
  now: number,
): { observations: Observation[]; scanned: number; withAnalytics: number } {
  const observations: Observation[] = [];
  let scanned = 0;
  let withAnalytics = 0;

  const projectsRoot = path.join(workspaceDir(ws), "projects");
  let projectIds: string[] = [];
  try {
    projectIds = fs
      .readdirSync(projectsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return { observations, scanned, withAnalytics };
  }

  for (const projectId of projectIds) {
    if (projectWorkspace(projectId) !== ws) continue; // registry is the source of truth
    for (const slug of listUnitSlugs(projectId)) {
      scanned += 1;
      const unitDir = unitDirFor(projectId, slug);
      const snapshots = readSnapshots(unitDir);
      if (snapshots.length === 0) continue;
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(fs.readFileSync(path.join(unitDir, "unit.json"), "utf8")) as Record<string, unknown>;
      } catch {
        /* tolerate: analytics without a readable manifest still counts nothing */
      }
      const tags = unitTags(meta);
      const publish = Array.isArray(meta.publish) ? (meta.publish as Array<Record<string, unknown>>) : [];
      // Posting-window per publish record, keyed by (target, postId) so a
      // snapshot only attributes to the window it was actually posted in.
      const windowByPost = new Map<string, string>();
      for (const p of publish) {
        const key = `${String(p.target)} ${String(p.postId)}`;
        const w = postingWindowBucket((p.scheduleAt as string) ?? (p.at as string));
        if (w) windowByPost.set(key, w);
      }

      let used = false;
      for (const snap of snapshots) {
        const raw = rawSignals(snap);
        if (Object.keys(raw).length === 0) continue; // no measured signal → skip
        used = true;
        const ageDays = Math.max(0, (now - Date.parse(snap.at)) / DAY_MS);
        // Provenance tags: attributed to every snapshot of the unit.
        for (const t of tags) observations.push({ ...t, raw, ageDays });
        // Platform + posting-window: per the snapshot's own (target, postId).
        observations.push({ dimension: "platform", value: snap.target, raw, ageDays });
        const w = windowByPost.get(`${snap.target} ${snap.postId}`);
        if (w) observations.push({ dimension: "postingWindow", value: w, raw, ageDays });
      }
      if (used) withAnalytics += 1;
    }
  }
  return { observations, scanned, withAnalytics };
}

/** Decay weight of a snapshot given its age (exponential half-life). */
function decayFactor(ageDays: number): number {
  return Math.pow(0.5, ageDays / DECAY_HALFLIFE_DAYS);
}

/**
 * Blend one snapshot's normalized signals into a single [0,1] score. Absent
 * signals drop out and the present weights renormalize (never a fake zero).
 */
function blendScore(norm: RawSignals): number | null {
  let num = 0;
  let den = 0;
  for (const [k, w] of Object.entries(BLEND)) {
    const v = (norm as Record<string, number | undefined>)[k];
    if (typeof v === "number") {
      num += w * v;
      den += w;
    }
  }
  return den > 0 ? num / den : null;
}

/**
 * Attribute measured outcomes across a workspace's units to (dimension,value)
 * pairs. Pure over the on-disk analytics — no writes. Returns a full weights
 * snapshot (cold-start = empty entries) ready to append or sample from.
 *
 * Sparsity handling: `confidence = min(1, decayedCount / CONFIDENCE_FULL_AT)`,
 * and the sampler-facing `weight` shrinks the score toward the neutral 0.5
 * baseline by that confidence — so a single decayed observation lands near
 * baseline (low, uncertain), never as a confident winner.
 */
export function attributeOutcomes(ws: string, now: number = Date.now()): WeightsSnapshot {
  const { observations, scanned, withAnalytics } = gatherObservations(ws, now);
  const computedAt = new Date(now).toISOString();

  if (observations.length === 0) {
    return {
      workspace: ws,
      computedAt,
      units: { scanned, withAnalytics },
      halfLifeDays: DECAY_HALFLIFE_DAYS,
      entries: [],
      coldStart: true,
    };
  }

  // Per-signal min/max ACROSS THE WORKSPACE for min-max normalization.
  const bounds: Record<string, { min: number; max: number }> = {};
  for (const o of observations) {
    for (const [k, v] of Object.entries(o.raw)) {
      if (typeof v !== "number") continue;
      const b = (bounds[k] ??= { min: v, max: v });
      if (v < b.min) b.min = v;
      if (v > b.max) b.max = v;
    }
  }

  // Aggregate per (dimension,value): decayed-weighted mean of the blended score.
  interface Acc {
    dimension: SelectionDimension;
    value: string;
    scoreNum: number;
    decayedCount: number;
    sampleSize: number;
    lastMs: number;
  }
  const accs = new Map<string, Acc>();
  for (const o of observations) {
    const norm: RawSignals = {};
    for (const [k, v] of Object.entries(o.raw)) {
      if (typeof v === "number") (norm as Record<string, number>)[k] = normalizeWithin(v, bounds[k]!.min, bounds[k]!.max);
    }
    const score = blendScore(norm);
    if (score === null) continue;
    const decay = decayFactor(o.ageDays);
    const key = `${o.dimension}|${o.value}`;
    const a = accs.get(key) ?? { dimension: o.dimension, value: o.value, scoreNum: 0, decayedCount: 0, sampleSize: 0, lastMs: 0 };
    a.scoreNum += score * decay;
    a.decayedCount += decay;
    a.sampleSize += 1;
    a.lastMs = Math.max(a.lastMs, now - o.ageDays * DAY_MS);
    accs.set(key, a);
  }

  const entries: WeightEntry[] = [];
  for (const a of accs.values()) {
    if (a.decayedCount <= 0) continue;
    const score = a.scoreNum / a.decayedCount;
    const confidence = Math.min(1, a.decayedCount / CONFIDENCE_FULL_AT);
    // Shrink toward the neutral baseline by (1 - confidence): n=1 → near 0.5.
    const weight = 0.5 + (score - 0.5) * confidence;
    entries.push({
      dimension: a.dimension,
      value: a.value,
      score: round(score),
      sampleSize: a.sampleSize,
      confidence: round(confidence),
      weight: round(Math.max(0, weight)),
      lastUpdated: new Date(a.lastMs).toISOString(),
    });
  }
  entries.sort((x, y) => y.weight - x.weight || x.dimension.localeCompare(y.dimension));

  return {
    workspace: ws,
    computedAt,
    units: { scanned, withAnalytics },
    halfLifeDays: DECAY_HALFLIFE_DAYS,
    entries,
    coldStart: false,
  };
}

function round(n: number): number {
  return Number(n.toFixed(4));
}

// ─── append-only weights history (mirrors trust.ts JSONL store) ──────────────

export function selectionWeightsPath(ws: string): string {
  return path.join(workspaceDir(ws), "selection-weights.jsonl");
}

/** Recompute the weights and APPEND the snapshot as one line. Returns it. */
export function recomputeSelectionWeights(ws: string, now: number = Date.now()): WeightsSnapshot {
  const snap = attributeOutcomes(ws, now);
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.appendFileSync(selectionWeightsPath(ws), JSON.stringify(snap) + "\n");
  return snap;
}

/**
 * Parse a `selection-weights.jsonl` file at an ABSOLUTE path into its newest
 * snapshot, or null when absent / empty. Factored out so callers that hold the
 * absolute workspace dir (the campaign store — decoupled from the paths
 * singleton) share ONE parser with the slug-based `readLatestWeights`.
 */
export function parseWeightsFile(absPath: string): WeightsSnapshot | null {
  let raw = "";
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split("\n").filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]!) as WeightsSnapshot;
    } catch {
      /* torn final line — walk back */
    }
  }
  return null;
}

/** The newest recompute snapshot, or null when none has been computed yet. */
export function readLatestWeights(ws: string): WeightsSnapshot | null {
  return parseWeightsFile(selectionWeightsPath(ws));
}

// ─── pin / retire lifecycle (append-only, reversible) ────────────────────────

export type SelectionFlagAction = "pin" | "retire" | "unpin" | "unretire";

export interface SelectionFlagEvent {
  at: string;
  event: "selection-flag";
  workspace: string;
  action: SelectionFlagAction;
  dimension: string;
  value: string;
  reason?: string;
}

/**
 * Fold the workspace's lifecycle log into the current pin/retire flag set.
 * Reversible: `unpin`/`unretire` (or the opposite action) clears the prior
 * flag. Last write per (dimension,value) wins.
 */
export function readSelectionFlags(ws: string): { pinned: Set<string>; retired: Set<string> } {
  return parseSelectionFlagsFile(lifecycleLogPath(ws));
}

/**
 * Parse a `lifecycle.jsonl` file at an ABSOLUTE path into the current pin/retire
 * flag set. The path-based twin of `readSelectionFlags` (see `parseWeightsFile`
 * for the rationale). Last write per (dimension,value) wins; unpin/unretire
 * clear the flag.
 */
export function parseSelectionFlagsFile(absPath: string): { pinned: Set<string>; retired: Set<string> } {
  const pinned = new Set<string>();
  const retired = new Set<string>();
  let raw = "";
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch {
    return { pinned, retired };
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let ev: Partial<SelectionFlagEvent>;
    try {
      ev = JSON.parse(line) as Partial<SelectionFlagEvent>;
    } catch {
      continue;
    }
    if (ev.event !== "selection-flag" || !ev.dimension || !ev.value) continue;
    const key = `${ev.dimension}|${ev.value}`;
    // Each action fully determines both sets for this key (mutually exclusive).
    pinned.delete(key);
    retired.delete(key);
    if (ev.action === "pin") pinned.add(key);
    else if (ev.action === "retire") retired.add(key);
    // unpin / unretire leave both cleared (already deleted above).
  }
  return { pinned, retired };
}

/** APPEND one pin/retire/unpin/unretire action to the workspace lifecycle log. */
export function appendSelectionFlag(
  ws: string,
  action: SelectionFlagAction,
  dimension: string,
  value: string,
  reason?: string,
): SelectionFlagEvent {
  const ev: SelectionFlagEvent = {
    at: new Date().toISOString(),
    event: "selection-flag",
    workspace: ws,
    action,
    dimension,
    value,
    ...(reason && { reason }),
  };
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.appendFileSync(lifecycleLogPath(ws), JSON.stringify(ev) + "\n");
  return ev;
}

// ─── SAMPLING SEAM (the #528 / #529 integration point) ───────────────────────
//
// This is the ONLY function #528 (campaign next-cell picker) and #529 (variance
// planner) call to bias their choice toward proven winners. It is PURE and
// fully tested standalone; those consumers are not built yet, so nothing else
// here wires into a live selection path. To integrate: read the latest weights
// (`readLatestWeights(ws)`), the flags (`readSelectionFlags(ws)`), build a
// `WeightLookup` (a `(dimension,value) -> weight` map), then call this per pick.

export interface Candidate {
  /** The dimension this candidate slot varies over (e.g. "template"). */
  dimension: SelectionDimension;
  /** The concrete value being offered. */
  value: string;
}

/** A resolved weight + flag lookup for one dimension's candidate values. */
export interface WeightLookup {
  /** weight of (dimension,value); missing = neutral baseline. */
  weightOf(dimension: string, value: string): number | undefined;
  pinned: Set<string>;
  retired: Set<string>;
}

export interface SampleOptions {
  /** Exploration floor: min share of probability mass spread uniformly. */
  epsilon?: number;
  /** Deterministic PRNG (tests / resumable runs). Defaults to a Math.random-seeded one. */
  prng?: Prng;
  /** Neutral weight used when a candidate has no measured weight yet. */
  baseline?: number;
}

/**
 * Sample ONE candidate proportional to its weight, with an exploration floor so
 * no candidate is ever fully starved (weights BIAS, never hard-exclude — the
 * #532 rule). Flag semantics (documented, matching the spec):
 *   • pinned  → weight is floored at PIN_FLOOR × the max candidate weight, so a
 *               human-pinned winner keeps a strong share even before it has data.
 *   • retired → weight is multiplied by RETIRE_MULTIPLIER (down-weighted), but
 *               the epsilon floor STILL applies, so a chronic loser is starved
 *               only toward — never to — zero. Hard exclusion needs human
 *               sign-off (a caller filtering the candidate list out entirely),
 *               NOT this function.
 * Cold-start / all-equal weights → uniform random (identical to today).
 */
export function sampleWeighted(
  candidates: Candidate[],
  lookup: WeightLookup,
  opts: SampleOptions = {},
): Candidate {
  if (candidates.length === 0) throw new Error("sampleWeighted: no candidates");
  if (candidates.length === 1) return candidates[0]!;

  const epsilon = clamp01(opts.epsilon ?? DEFAULT_EPSILON);
  const baseline = opts.baseline ?? 0.5;
  const prng = opts.prng ?? makePrng((Math.random() * 0xffffffff) >>> 0);

  // Resolve each candidate's effective weight (baseline when unmeasured).
  const base = candidates.map((c) => lookup.weightOf(c.dimension, c.value) ?? baseline);
  const maxW = Math.max(...base, 0);
  const weights = candidates.map((c, i) => {
    const key = `${c.dimension}|${c.value}`;
    let w = Math.max(0, base[i]!);
    if (lookup.retired.has(key)) w *= RETIRE_MULTIPLIER;
    if (lookup.pinned.has(key)) w = Math.max(w, PIN_FLOOR * maxW, PIN_FLOOR * baseline);
    return w;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  const n = candidates.length;
  // Mix: (1-epsilon) proportional-to-weight + epsilon uniform. The uniform
  // term is what guarantees every candidate keeps a positive draw probability.
  const probs = weights.map((w) => {
    const proportional = total > 0 ? w / total : 1 / n;
    return (1 - epsilon) * proportional + epsilon * (1 / n);
  });

  let r = prng.next();
  for (let i = 0; i < n; i++) {
    r -= probs[i]!;
    if (r <= 0) return candidates[i]!;
  }
  return candidates[n - 1]!; // float slack
}

/** Build a WeightLookup from a stored snapshot + flags (the consumer glue). */
export function buildLookup(snapshot: WeightsSnapshot | null, flags: { pinned: Set<string>; retired: Set<string> }): WeightLookup {
  const map = new Map<string, number>();
  for (const e of snapshot?.entries ?? []) map.set(`${e.dimension}|${e.value}`, e.weight);
  return {
    weightOf: (dimension, value) => map.get(`${dimension}|${value}`),
    pinned: flags.pinned,
    retired: flags.retired,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
