// Originality comparator (#561). PURE: no I/O.
//
// Compares a SUBJECT fingerprint against one OTHER fingerprint on three axes
// and returns a verdict. Every score reads "how much of the subject already
// exists in the other", in [0, 1]:
//
//   • visual — sampled frames, pHash + dHash (frame-hash.ts). Each subject
//     frame earns credit for its best match in the other (a ramp between
//     FRAME_LOW and FRAME_HIGH similarity). Two numbers come out:
//       material — mean credit, order ignored ("the same footage is in there"),
//       sequence — best monotonic alignment ("the same footage in the same
//                  order"), found with a many-to-one DP so speed changes and
//                  trims still align.
//     score = sequence + REORDER_WEIGHT x (material - sequence): footage
//     reused in a new order counts half. Both orientations are tried, so a
//     mirrored copy scores like the original.
//   • audio — block-wise band-energy fingerprint (audio-fingerprint.ts), the
//     same material / sequence / score shape over ~2 s blocks.
//   • script — word 3-gram containment of the subject's VO / transcript text.
//
// The verdict (thresholds in ORIGINALITY_THRESHOLDS, documented in
// docs/research/originality.md):
//   likely-duplicate — visual score >= visual.duplicate; or the same soundtrack
//       (audio score >= audio.duplicate) over substantially reused footage
//       (visual material >= visual.similar); or, when neither side has
//       pictures, audio >= audio.duplicate or script >= script.duplicate.
//   similar — any axis score >= its `similar` threshold, or visual material
//       >= visual.similar (the footage is reused even if re-cut).
//   original — otherwise.
// Script alone never makes a video a duplicate (a re-shot video of the same
// script is a new video), and audio alone never does either (a licensed
// trending sound under new pictures is normal); both still read "similar".

import { matchAudioBlocks, voicedShare, type AudioFingerprint, BLOCK_FRAMES } from "./audio-fingerprint.js";
import { signatureSimilarity, type FrameSignature } from "./frame-hash.js";
import { compareScripts } from "./script-similarity.js";

export const ORIGINALITY_THRESHOLDS = {
  /** Per-frame similarity ramp (128-bit signature): <= low earns 0, >= high earns 1. */
  frame: { low: 0.7, high: 0.85 },
  /** Per-block bit-error-rate ramp: <= match earns 1, >= none earns 0. */
  audioBer: { match: 0.2, none: 0.35 },
  /** Weight of reused-but-reordered material in the axis score. */
  reorderWeight: 0.5,
  visual: { duplicate: 0.85, similar: 0.5 },
  audio: { duplicate: 0.85, similar: 0.5 },
  script: { duplicate: 0.9, similar: 0.6 },
} as const;

export type OriginalityVerdict = "likely-duplicate" | "similar" | "original";
export const VERDICT_RANK: Record<OriginalityVerdict, number> = { original: 0, similar: 1, "likely-duplicate": 2 };

/** Everything the comparator needs about one piece of media. */
export interface MediaFingerprint {
  /** Human label (unit slug, file name). */
  label: string;
  /** The media path the fingerprint was taken from, when any. */
  path: string | null;
  kind: "video" | "image" | "audio" | "text";
  durationSec: number | null;
  /** Sampled frames (empty when the piece has no pictures). */
  frames: FrameSignature[];
  /** Audio fingerprint (null when the piece has no audible track). */
  audio: AudioFingerprint | null;
  /** Spoken / published text (null when none was found). */
  script: string | null;
  /** Where the script came from. */
  scriptSource: string | null;
}

export interface SequenceAxis {
  /** Axis score in [0, 1]. */
  score: number;
  /** Reuse regardless of order. */
  material: number;
  /** Reuse in the same order. */
  sequence: number;
}

export interface VisualAxis extends SequenceAxis {
  /** True when the mirrored orientation matched better. */
  mirrored: boolean;
  /** Non-flat frames compared on each side. */
  frames: { subject: number; other: number };
}

export interface AudioAxis extends SequenceAxis {
  /** Median best-block bit error rate (0 identical, ~0.5 unrelated). */
  medianBer: number;
  /** Audible blocks compared. */
  blocks: number;
}

export interface ScriptAxis {
  /** Axis score: share of the subject's 3-grams found in the other text. */
  score: number;
  jaccard: number;
  hook: number;
}

export interface Comparison {
  verdict: OriginalityVerdict;
  visual: VisualAxis | null;
  audio: AudioAxis | null;
  script: ScriptAxis | null;
  /** Axes that had data on both sides. */
  axesCompared: Array<"visual" | "audio" | "script">;
  reasons: string[];
}

/** Compare a subject against one other piece. */
export function compareFingerprints(subject: MediaFingerprint, other: MediaFingerprint): Comparison {
  const visual = compareVisual(subject.frames, other.frames);
  const audio = subject.audio && other.audio ? compareAudio(subject.audio, other.audio) : null;
  const scriptSim = subject.script && other.script ? compareScripts(subject.script, other.script) : null;
  const script: ScriptAxis | null = scriptSim
    ? { score: scriptSim.containment, jaccard: scriptSim.jaccard, hook: scriptSim.hook }
    : null;
  const axesCompared = [
    ...(visual ? (["visual"] as const) : []),
    ...(audio ? (["audio"] as const) : []),
    ...(script ? (["script"] as const) : []),
  ];
  const { verdict, reasons } = decideVerdict({ visual, audio, script });
  return { verdict, visual, audio, script, axesCompared, reasons };
}

/** Apply the documented thresholds to per-axis results. */
export function decideVerdict(axes: {
  visual: VisualAxis | SequenceAxis | null;
  audio: AudioAxis | SequenceAxis | null;
  script: ScriptAxis | null;
}): { verdict: OriginalityVerdict; reasons: string[] } {
  const t = ORIGINALITY_THRESHOLDS;
  const { visual, audio, script } = axes;
  const reasons: string[] = [];
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  if (visual && visual.score >= t.visual.duplicate) {
    reasons.push(`visual ${pct(visual.score)}: the same footage in the same order${"mirrored" in visual && visual.mirrored ? " (mirrored)" : ""}`);
  }
  if (audio && audio.score >= t.audio.duplicate && visual && visual.material >= t.visual.similar) {
    reasons.push(`audio ${pct(audio.score)} over reused footage (${pct(visual.material)} of frames found)`);
  }
  if (!visual && audio && audio.score >= t.audio.duplicate) {
    reasons.push(`audio ${pct(audio.score)}: the same soundtrack and no pictures to tell them apart`);
  }
  if (!visual && !audio && script && script.score >= t.script.duplicate) {
    reasons.push(`script ${pct(script.score)}: the same text`);
  }
  if (reasons.length > 0) return { verdict: "likely-duplicate", reasons };

  if (visual && visual.score >= t.visual.similar) reasons.push(`visual ${pct(visual.score)}: footage reused with re-edits`);
  else if (visual && visual.material >= t.visual.similar) {
    reasons.push(`visual material ${pct(visual.material)}: the same footage, re-cut (sequence ${pct(visual.sequence)})`);
  }
  if (audio && audio.score >= t.audio.similar) reasons.push(`audio ${pct(audio.score)}: soundtrack reused (fine for a licensed trending sound, not for original VO)`);
  if (script && script.score >= t.script.similar) reasons.push(`script ${pct(script.score)}: most of the script already exists there`);
  if (reasons.length > 0) return { verdict: "similar", reasons };

  return { verdict: "original", reasons: ["no axis above its similar threshold"] };
}

// ─── visual ──────────────────────────────────────────────────────────────────

/** Visual axis, or null when either side has no structured frames. */
export function compareVisual(subjectFrames: FrameSignature[], otherFrames: FrameSignature[]): VisualAxis | null {
  const a = subjectFrames.filter((f) => !f.flat);
  const b = otherFrames.filter((f) => !f.flat);
  if (a.length === 0 || b.length === 0) return null;
  const normal = alignVisual(a, b, false);
  const mirrored = alignVisual(a, b, true);
  const best = mirrored.score > normal.score + 1e-9 ? { ...mirrored, mirrored: true } : { ...normal, mirrored: false };
  return { ...best, frames: { subject: a.length, other: b.length } };
}

function alignVisual(a: FrameSignature[], b: FrameSignature[], mirror: boolean): SequenceAxis {
  const { low, high } = ORIGINALITY_THRESHOLDS.frame;
  const credit = (s: number) => clamp01((s - low) / (high - low));
  const rows: Float64Array[] = a.map((frame) => {
    const sig = mirror ? frame.mirror : frame.hash;
    const row = new Float64Array(b.length);
    for (let j = 0; j < b.length; j++) row[j] = credit(signatureSimilarity(sig, b[j]!.hash));
    return row;
  });
  return sequenceScore(rows, a.length);
}

// ─── audio ───────────────────────────────────────────────────────────────────

/** Audio axis, or null when either track is effectively silent. */
export function compareAudio(subject: AudioFingerprint, other: AudioFingerprint): AudioAxis | null {
  if (voicedShare(subject) < 0.1 || voicedShare(other) < 0.1) return null;
  const blocks = matchAudioBlocks(subject, other);
  if (blocks.length === 0) return null;
  const { match, none } = ORIGINALITY_THRESHOLDS.audioBer;
  const credit = (ber: number) => clamp01((none - ber) / (none - match));
  // Offsets are bucketed by block length so the monotonic DP stays small.
  const bucket = Math.max(1, Math.floor(BLOCK_FRAMES / 4));
  const width = Math.floor(other.bits.length / bucket) + 1;
  const rows = blocks.map((block) => {
    const row = new Float64Array(width);
    row[Math.floor(block.offset / bucket)] = credit(block.ber);
    return row;
  });
  const axis = sequenceScore(rows, blocks.length);
  const bers = blocks.map((block) => block.ber).sort((x, y) => x - y);
  return { ...axis, medianBer: round(bers[bers.length >> 1]!), blocks: blocks.length };
}

// ─── shared alignment ────────────────────────────────────────────────────────

/**
 * Given a credit matrix (subject items x other positions), compute
 * material = mean of each row's best credit, and sequence = the best total
 * credit of a non-decreasing (many-to-one) alignment, both normalized by the
 * subject length.
 */
export function sequenceScore(rows: Float64Array[], subjectLength: number): SequenceAxis {
  if (rows.length === 0 || subjectLength === 0) return { score: 0, material: 0, sequence: 0 };
  const width = rows[0]!.length;
  let materialSum = 0;
  let prev = new Float64Array(width);
  for (const row of rows) {
    let rowBest = 0;
    const cur = new Float64Array(width);
    for (let j = 0; j < width; j++) {
      const c = row[j]!;
      if (c > rowBest) rowBest = c;
      const take = prev[j]! + c;
      cur[j] = j > 0 ? Math.max(cur[j - 1]!, take) : take;
    }
    materialSum += rowBest;
    prev = cur;
  }
  const material = materialSum / subjectLength;
  const sequence = Math.min(material, prev[width - 1]! / subjectLength);
  const score = sequence + ORIGINALITY_THRESHOLDS.reorderWeight * (material - sequence);
  return { score: round(score), material: round(material), sequence: round(sequence) };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
