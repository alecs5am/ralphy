// The originality check (#561): fingerprint a subject and its comparison
// targets locally, compare on every axis, and roll up a verdict. Backs
// `ralphy unit originality` and the variant tournament's sibling gate.
// Local only: ffmpeg decodes, hashing is pure TypeScript, no provider call.

import {
  compareFingerprints,
  ORIGINALITY_THRESHOLDS,
  VERDICT_RANK,
  type Comparison,
  type MediaFingerprint,
  type OriginalityVerdict,
} from "./compare.js";
import { fingerprintMedia } from "./extract.js";
import type { OriginalityTarget, SkippedTarget, TargetOrigin } from "./targets.js";

export const ORIGINALITY_ENGINES = {
  visual: "phash64+dhash64 over 32x32 luma, <=2 fps, mirror-tested",
  audio: "band-energy-difference 32-bit, 8 kHz, 32 ms hop, 2 s blocks",
  script: "word 3-gram containment",
} as const;

/** One row of the report: the subject against one target. */
export interface ComparisonRow {
  ref: string;
  label: string;
  origin: TargetOrigin;
  verdict: OriginalityVerdict;
  /** Visual axis score (same footage, order-weighted). */
  visual: number | null;
  /** Share of sampled frames found anywhere in the target (order ignored). */
  footage: number | null;
  /** Share of sampled frames found in the same order. */
  sequence: number | null;
  mirrored: boolean | null;
  audio: number | null;
  script: number | null;
  hook: number | null;
  reasons: string;
}

export interface OriginalityReport {
  subject: {
    ref: string;
    label: string;
    kind: MediaFingerprint["kind"];
    path: string | null;
    durationSec: number | null;
    frames: number;
    audio: boolean;
    script: string | null;
  };
  verdict: OriginalityVerdict;
  nearest: ComparisonRow | null;
  comparisons: ComparisonRow[];
  skipped: SkippedTarget[];
  thresholds: typeof ORIGINALITY_THRESHOLDS;
  engines: typeof ORIGINALITY_ENGINES;
  next: string;
}

/** Fingerprint a target; the error message is returned instead of thrown. */
export async function fingerprintTarget(target: OriginalityTarget): Promise<MediaFingerprint | { error: string }> {
  try {
    return await fingerprintMedia({
      path: target.path,
      label: target.label,
      script: target.script,
      scriptSource: target.scriptSource,
      ...(target.kind ? { kind: target.kind } : {}),
    });
  } catch (error) {
    return { error: (error as Error).message.slice(0, 240) };
  }
}

/** Flatten one comparison into a report row. */
export function comparisonRow(target: Pick<OriginalityTarget, "ref" | "label" | "origin">, comparison: Comparison): ComparisonRow {
  return {
    ref: target.ref,
    label: target.label,
    origin: target.origin,
    verdict: comparison.verdict,
    visual: comparison.visual?.score ?? null,
    footage: comparison.visual?.material ?? null,
    sequence: comparison.visual?.sequence ?? null,
    mirrored: comparison.visual ? comparison.visual.mirrored : null,
    audio: comparison.audio?.score ?? null,
    script: comparison.script?.score ?? null,
    hook: comparison.script?.hook ?? null,
    reasons: comparison.reasons.join("; "),
  };
}

/** Severity first, then the strongest single axis. */
export function rowStrength(row: ComparisonRow): number {
  return VERDICT_RANK[row.verdict] * 10 + Math.max(row.visual ?? 0, row.audio ?? 0, row.script ?? 0);
}

/** Run the full check. Targets that cannot be decoded land in `skipped`. */
export async function runOriginalityCheck(input: {
  subject: OriginalityTarget;
  targets: OriginalityTarget[];
  skipped?: SkippedTarget[];
}): Promise<OriginalityReport> {
  const subjectFp = await fingerprintTarget(input.subject);
  if ("error" in subjectFp) throw new Error(`cannot fingerprint ${input.subject.ref}: ${subjectFp.error}`);
  const skipped = [...(input.skipped ?? [])];
  const rows: ComparisonRow[] = [];
  const seen = new Set<string>();
  for (const target of input.targets) {
    const key = `${target.unitId ?? ""}|${target.path ?? ""}|${target.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (target.path && input.subject.path && target.path === input.subject.path) continue;
    const fp = await fingerprintTarget(target);
    if ("error" in fp) {
      skipped.push({ ref: target.ref, reason: fp.error });
      continue;
    }
    const comparison = compareFingerprints(subjectFp, fp);
    if (comparison.axesCompared.length === 0) {
      skipped.push({ ref: target.ref, reason: "no shared axis to compare (no pictures, audible sound, or script on one side)" });
      continue;
    }
    rows.push(comparisonRow(target, comparison));
  }
  rows.sort((a, b) => rowStrength(b) - rowStrength(a) || a.ref.localeCompare(b.ref, "en"));
  const nearest = rows[0] ?? null;
  const verdict: OriginalityVerdict = nearest?.verdict ?? "original";
  return {
    subject: {
      ref: input.subject.ref,
      label: input.subject.label,
      kind: subjectFp.kind,
      path: subjectFp.path,
      durationSec: subjectFp.durationSec,
      frames: subjectFp.frames.filter((frame) => !frame.flat).length,
      audio: subjectFp.audio !== null,
      script: subjectFp.scriptSource,
    },
    verdict,
    nearest,
    comparisons: rows,
    skipped,
    thresholds: ORIGINALITY_THRESHOLDS,
    engines: ORIGINALITY_ENGINES,
    next: nextStep(verdict, rows.length),
  };
}

function nextStep(verdict: OriginalityVerdict, compared: number): string {
  if (compared === 0) return "Nothing comparable was found; pass --against <unit|project|path> to compare explicitly.";
  if (verdict === "likely-duplicate") {
    return "Do not publish as a new piece. Change substance (new hook, new VO, re-edit or reorder, new B-roll, new layout or format); mirror, speed, grade, crop, and trim do not count.";
  }
  if (verdict === "similar") {
    return "Reuses material from an earlier piece. Fine for a deliberate series or a licensed sound; otherwise change another substantive axis before publishing.";
  }
  return "No earlier piece reuses this footage, soundtrack, or script above the similar thresholds.";
}
