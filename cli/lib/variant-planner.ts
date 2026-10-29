// Variant planner (#561) — makes variants that are genuinely different, and
// knows which changes do not count.
//
// Platforms judge originality by what a piece adds, not by whether a hash
// still matches (docs/research/originality.md): Instagram lists speed changes
// and borders as not original, YouTube lists trivial edits and speed-altered
// songs, Meta lists stitched clips and watermarks. So the planner separates:
//
//   • SUBSTANTIVE axes — a new hook, a structure reorder, a VO re-record, a
//     B-roll swap, a layout or format swap, pacing, a script / CTA / persona
//     change. Each moves one or more fingerprint channels (visual / audio /
//     script) that `ralphy unit originality` measures.
//   • COSMETIC transforms — mirror, speed, grade / LUT, crop, trim, noise,
//     borders, pitch, re-encode. Allowed only as an optional LAST layer on
//     top of a substantive plan, and NEVER counted toward uniqueness.
//
// `planVariants()` is PURE and deterministic: it assigns each variant a
// distinct set of substantive axes that changes the pictures in substance and
// moves at least two channels, so siblings differ from the base and from each
// other in substance. The
// tournament (#421) records the plan per variant and refuses a sibling whose
// measured similarity still crosses the duplicate threshold.

export type FingerprintChannel = "visual" | "audio" | "script";

export interface SubstantiveAxisDef {
  axis: string;
  label: string;
  /** Fingerprint channels this change moves. */
  moves: FingerprintChannel[];
  /** A partial axis touches only part of the piece (the opening, the CTA). */
  strength: "strong" | "partial";
}

export const SUBSTANTIVE_AXES: readonly SubstantiveAxisDef[] = [
  { axis: "hook-rewrite", label: "New hook: a rewritten opening line and a new first shot", moves: ["script", "audio", "visual"], strength: "partial" },
  { axis: "structure-reorder", label: "Re-edit: beats reordered or restructured (a new narrative order)", moves: ["visual", "script", "audio"], strength: "strong" },
  { axis: "vo-rerecord", label: "VO re-record: a new read, voice, or delivery", moves: ["audio"], strength: "strong" },
  { axis: "broll-swap", label: "New B-roll: different footage or generations under the story", moves: ["visual"], strength: "strong" },
  { axis: "layout-swap", label: "New layout: split screen, picture-in-picture, text-led, or full-bleed", moves: ["visual"], strength: "strong" },
  { axis: "format-swap", label: "New format: talking head to listicle, demo to story, video to carousel", moves: ["visual", "script", "audio"], strength: "strong" },
  { axis: "pacing", label: "New pacing: different cut rhythm, scene lengths, and duration", moves: ["visual", "audio"], strength: "partial" },
  { axis: "script-rewrite", label: "New body script: different points, examples, or proof", moves: ["script", "audio"], strength: "strong" },
  { axis: "cta-rewrite", label: "New CTA: a different ask at the end", moves: ["script"], strength: "partial" },
  { axis: "persona-swap", label: "New on-screen persona or creator", moves: ["visual", "audio"], strength: "strong" },
];

export interface CosmeticTransformDef {
  transform: string;
  label: string;
}

/** Cosmetic transforms: optional last layer, never counted as uniqueness. */
export const COSMETIC_TRANSFORMS: readonly CosmeticTransformDef[] = [
  { transform: "mirror", label: "Horizontal flip" },
  { transform: "speed", label: "Playback speed change (for example 1.1x to 1.2x)" },
  { transform: "color-grade", label: "LUT, grade, saturation, or brightness change" },
  { transform: "crop", label: "Crop, zoom, or reframe of the same shot" },
  { transform: "trim", label: "Trimming a second off the start or end" },
  { transform: "noise", label: "Grain, noise, or blur overlay" },
  { transform: "border", label: "Borders, frames, or a background pad" },
  { transform: "pitch", label: "Pitch shift of the same audio" },
  { transform: "reencode", label: "Re-encode, bitrate, or resolution change" },
  { transform: "watermark", label: "An added watermark or logo" },
];

/** Legacy `batch vary` axes (#024) mapped onto the substantive taxonomy. */
export const VARY_AXIS_MAP: Record<string, string> = {
  hook: "hook-rewrite",
  body: "script-rewrite",
  cta: "cta-rewrite",
  persona: "persona-swap",
};

/** Common synonyms accepted on input. */
const AXIS_ALIASES: Record<string, string> = {
  hook: "hook-rewrite",
  reorder: "structure-reorder",
  structure: "structure-reorder",
  "re-edit": "structure-reorder",
  vo: "vo-rerecord",
  "vo-rerecord": "vo-rerecord",
  voiceover: "vo-rerecord",
  broll: "broll-swap",
  "b-roll": "broll-swap",
  "b-roll-swap": "broll-swap",
  layout: "layout-swap",
  format: "format-swap",
  body: "script-rewrite",
  script: "script-rewrite",
  cta: "cta-rewrite",
  persona: "persona-swap",
  pace: "pacing",
  lut: "color-grade",
  grade: "color-grade",
  flip: "mirror",
  hflip: "mirror",
  zoom: "crop",
  grain: "noise",
};

const SUBSTANTIVE = new Map(SUBSTANTIVE_AXES.map((def) => [def.axis, def]));
const COSMETIC = new Map(COSMETIC_TRANSFORMS.map((def) => [def.transform, def]));

export type AxisClass = "substantive" | "cosmetic" | "unknown";

/** Canonical axis / transform id for a free-form label. */
export function canonicalAxis(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[_\s]+/gu, "-");
  return AXIS_ALIASES[key] ?? key;
}

/** Classify a free-form axis label. */
export function classifyAxis(raw: string): AxisClass {
  const axis = canonicalAxis(raw);
  if (SUBSTANTIVE.has(axis)) return "substantive";
  if (COSMETIC.has(axis)) return "cosmetic";
  return "unknown";
}

export interface UniquenessSummary {
  /** Substantive axes (canonical), sorted. */
  substantive: string[];
  /** Cosmetic transforms (canonical), sorted. Never counted. */
  cosmetic: string[];
  /** Labels the planner does not know. Never counted. */
  unknown: string[];
  /** Fingerprint channels the substantive axes move. */
  channels: FingerprintChannel[];
  /**
   * True when the plan changes the pictures in substance (at least one strong
   * axis that moves the visual channel) AND moves at least two channels.
   * Footage reuse is what perceptual video matching sees first, so a change
   * that leaves the footage alone (a new hook line, a new VO, a new CTA) is
   * not enough on its own.
   */
  sufficient: boolean;
}

/**
 * Summarize what a set of changes contributes to uniqueness. Cosmetic and
 * unknown labels are listed but contribute nothing.
 */
export function uniquenessOf(changes: string[]): UniquenessSummary {
  const substantive = new Set<string>();
  const cosmetic = new Set<string>();
  const unknown = new Set<string>();
  for (const raw of changes) {
    if (!raw || !raw.trim()) continue;
    const axis = canonicalAxis(raw);
    const kind = classifyAxis(axis);
    if (kind === "substantive") substantive.add(axis);
    else if (kind === "cosmetic") cosmetic.add(axis);
    else unknown.add(axis);
  }
  const channels = new Set<FingerprintChannel>();
  let strongVisual = 0;
  for (const axis of substantive) {
    const def = SUBSTANTIVE.get(axis)!;
    for (const channel of def.moves) channels.add(channel);
    if (def.strength === "strong" && def.moves.includes("visual")) strongVisual += 1;
  }
  return {
    substantive: [...substantive].sort(),
    cosmetic: [...cosmetic].sort(),
    unknown: [...unknown].sort(),
    channels: (["visual", "audio", "script"] as const).filter((channel) => channels.has(channel)),
    sufficient: strongVisual >= 1 && channels.size >= 2,
  };
}

export interface PlannedVariant {
  variantId: string;
  /** Substantive axes this variant changes (what #558 attributes results to). */
  changedAxes: string[];
  /** Optional cosmetic last layer. Recorded, never counted. */
  cosmeticLayer: string[];
  /** Fingerprint channels the changed axes move. */
  channels: FingerprintChannel[];
  hypothesis: string;
}

export interface PlanVariantsInput {
  baseId: string;
  count: number;
  /** Substantive axes to draw from (default: every substantive axis). */
  axes?: string[];
  /** Minimum substantive axes per variant (default 2). */
  minAxes?: number;
  /** Optional cosmetic last layer applied to every variant. */
  cosmetic?: string[];
  /** Per-axis hypothesis text. */
  hypotheses?: Record<string, string>;
}

export class VariantPlanError extends Error {}

/**
 * Plan N variants with pairwise-distinct substantive axis sets. Each set has
 * at least `minAxes` axes and is `sufficient` (a strong visual change plus a
 * second channel), so no variant relies on a hook line or a VO alone. Deterministic: the same input
 * always yields the same plan. Throws VariantPlanError when a cosmetic label is
 * offered as a variation axis or the pool cannot produce enough distinct sets.
 */
export function planVariants(input: PlanVariantsInput): PlannedVariant[] {
  const count = Math.floor(input.count);
  if (!Number.isFinite(count) || count < 1 || count > 50) throw new VariantPlanError("count must be between 1 and 50");
  const minAxes = Math.max(1, Math.floor(input.minAxes ?? 2));
  const pool: string[] = [];
  for (const raw of input.axes && input.axes.length > 0 ? input.axes : SUBSTANTIVE_AXES.map((def) => def.axis)) {
    const axis = canonicalAxis(raw);
    const kind = classifyAxis(axis);
    if (kind === "cosmetic") {
      throw new VariantPlanError(`"${raw}" is a cosmetic transform; it never counts as uniqueness. Pass it with --cosmetic as an optional last layer.`);
    }
    if (kind === "unknown") {
      throw new VariantPlanError(`"${raw}" is not a known substantive axis (${SUBSTANTIVE_AXES.map((def) => def.axis).join(", ")})`);
    }
    if (!pool.includes(axis)) pool.push(axis);
  }
  const cosmetic: string[] = [];
  for (const raw of input.cosmetic ?? []) {
    const transform = canonicalAxis(raw);
    if (classifyAxis(transform) !== "cosmetic") {
      throw new VariantPlanError(`"${raw}" is not a cosmetic transform (${COSMETIC_TRANSFORMS.map((def) => def.transform).join(", ")})`);
    }
    if (!cosmetic.includes(transform)) cosmetic.push(transform);
  }
  if (pool.length < minAxes) throw new VariantPlanError(`need at least ${minAxes} substantive axes to plan from (got ${pool.length})`);

  // Enumerate combinations by size, then rank: strong axes and channel
  // coverage first, then rotate through the pool so consecutive variants
  // lean on different axes.
  const order = new Map(pool.map((axis, index) => [axis, index]));
  const combos: string[][] = [];
  for (let size = minAxes; size <= Math.min(pool.length, minAxes + 1) && combos.length < count * 4; size++) {
    for (const combo of combinations(pool, size)) {
      if (uniquenessOf(combo).sufficient) combos.push(combo);
    }
  }
  const usage = new Map<string, number>();
  const chosen: string[][] = [];
  const remaining = [...combos];
  while (chosen.length < count && remaining.length > 0) {
    remaining.sort((a, b) => comboRank(a, usage, order) - comboRank(b, usage, order));
    const next = remaining.shift()!;
    chosen.push(next);
    for (const axis of next) usage.set(axis, (usage.get(axis) ?? 0) + 1);
  }
  if (chosen.length < count) {
    throw new VariantPlanError(`only ${chosen.length} distinct substantive plans fit the axis pool; add axes or lower the count`);
  }
  return chosen.map((axes, index) => {
    const sorted = [...axes].sort((a, b) => order.get(a)! - order.get(b)!);
    const summary = uniquenessOf(sorted);
    const hypothesis = sorted
      .map((axis) => input.hypotheses?.[axis])
      .filter((text): text is string => typeof text === "string" && text.length > 0)
      .join("; ");
    return {
      variantId: `${input.baseId}-v${index + 1}`,
      changedAxes: sorted,
      cosmeticLayer: [...cosmetic],
      channels: summary.channels,
      hypothesis: hypothesis || `${sorted.join(" + ")} changes the piece in substance`,
    };
  });
}

function comboRank(combo: string[], usage: Map<string, number>, order: Map<string, number>): number {
  const summary = uniquenessOf(combo);
  const strong = combo.filter((axis) => SUBSTANTIVE.get(axis)!.strength === "strong").length;
  const used = combo.reduce((sum, axis) => sum + (usage.get(axis) ?? 0), 0);
  const position = combo.reduce((sum, axis) => sum + order.get(axis)!, 0);
  // Lower is better: least-used axes, broad channel coverage, strong axes, pool order.
  return used * 1000 - summary.channels.length * 100 - strong * 10 + combo.length + position / 100;
}

function* combinations<T>(items: T[], size: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === size) {
    yield [...prefix];
    return;
  }
  for (let i = start; i < items.length; i++) {
    prefix.push(items[i]!);
    yield* combinations(items, size, i + 1, prefix);
    prefix.pop();
  }
}
