// Contact-sheet digest eval scorer (#557).
//
// Scores an analyzer's answers (an agent reading ONLY the contact sheets of a
// `ralphy ref digest` bundle) against the labeled reference set in
// cli/lib/eval/calibration-datasets/contact-sheet-digest.json. Pure functions,
// no I/O, no model calls — the eval runner (scripts/contact-sheet-eval.ts)
// supplies the dataset, the answers, and the build stats.
//
// Question types and their scores (each in 0..1):
//   cutF1        — cut positions, greedy one-to-one match within ±CUT_TOLERANCE_SEC
//   cutCount     — 1 - |predicted - true| / max(true, 1), floored at 0
//   text         — on-screen text present? accuracy on the 1 s grid (t = k + 0.5)
//   hookText     — word F1 of the text visible in the first 2 s
//   hook         — mean accuracy of face / text overlay / cut in first 2 s / opening class
//   transitions  — Jaccard of the transition-type set
//   shotClass    — talking_head | b_roll | graphics accuracy on the 1 s grid
//   cta          — CTA presence + start (±1.5 s full, ±3 s half); unlabeled = excluded

export const CUT_TOLERANCE_SEC = 0.5;

export type ShotClass = "talking_head" | "b_roll" | "graphics";
export type TransitionType = "hard_cut" | "dissolve_fade" | "motion";

export interface HookFacts {
  face: boolean;
  textOverlay: boolean;
  cutInFirst2s: boolean;
  openingClass: ShotClass;
  /** Main on-screen text visible in the first 2 s, or null. */
  text: string | null;
}

export interface CtaFacts {
  present: boolean;
  startSec: number | null;
}

export interface DigestEvalLabels {
  cuts: number[];
  transitions: TransitionType[];
  /** textGrid[k] = text visible at t = k + 0.5 s. */
  textGrid: boolean[];
  /** classGrid[k] = shot class at t = k + 0.5 s. */
  classGrid: ShotClass[];
  hook: HookFacts;
  /** null = not labeled for this video (excluded from the cta score). */
  cta: CtaFacts | null;
}

export interface DigestEvalAnswer {
  cuts: number[];
  transitions: TransitionType[];
  textIntervals: Array<[number, number]>;
  segments: Array<{ startSec: number; class: ShotClass }>;
  hook: HookFacts;
  cta: CtaFacts;
}

export type QuestionKey = "cutF1" | "cutCount" | "text" | "hookText" | "hook" | "transitions" | "shotClass" | "cta";

export const QUESTION_KEYS: QuestionKey[] = [
  "cutF1",
  "cutCount",
  "text",
  "hookText",
  "hook",
  "transitions",
  "shotClass",
  "cta",
];

export type QuestionScores = Record<QuestionKey, number | null>;

/** Greedy one-to-one match of predicted to true cuts within `tol` seconds. */
export function cutF1(pred: number[], truth: number[], tol: number = CUT_TOLERANCE_SEC): number {
  if (pred.length === 0 && truth.length === 0) return 1;
  if (pred.length === 0 || truth.length === 0) return 0;
  const pairs: Array<{ d: number; p: number; t: number }> = [];
  pred.forEach((p, i) =>
    truth.forEach((t, j) => {
      const d = Math.abs(p - t);
      if (d <= tol) pairs.push({ d, p: i, t: j });
    }),
  );
  pairs.sort((a, b) => a.d - b.d);
  const usedP = new Set<number>();
  const usedT = new Set<number>();
  let tp = 0;
  for (const pr of pairs) {
    if (usedP.has(pr.p) || usedT.has(pr.t)) continue;
    usedP.add(pr.p);
    usedT.add(pr.t);
    tp++;
  }
  const precision = tp / pred.length;
  const recall = tp / truth.length;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

export function cutCountScore(pred: number, truth: number): number {
  return Math.max(0, 1 - Math.abs(pred - truth) / Math.max(truth, 1));
}

function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%$]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 0);
}

/** Bag-of-words F1; both empty = 1, one empty = 0. */
export function wordF1(pred: string | null, truth: string | null): number {
  const p = tokens(pred);
  const t = tokens(truth);
  if (p.length === 0 && t.length === 0) return 1;
  if (p.length === 0 || t.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const w of t) counts.set(w, (counts.get(w) ?? 0) + 1);
  let overlap = 0;
  for (const w of p) {
    const c = counts.get(w) ?? 0;
    if (c > 0) {
      overlap++;
      counts.set(w, c - 1);
    }
  }
  if (overlap === 0) return 0;
  const precision = overlap / p.length;
  const recall = overlap / t.length;
  return (2 * precision * recall) / (precision + recall);
}

export function jaccard<T>(a: T[], b: T[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Is t inside any [start, end] interval (inclusive)? */
export function inIntervals(t: number, intervals: Array<[number, number]>): boolean {
  return intervals.some(([s, e]) => t >= s && t <= e);
}

/** Class of the last segment starting at or before t (first segment's class before it). */
export function classAt(t: number, segments: Array<{ startSec: number; class: ShotClass }>): ShotClass | null {
  if (segments.length === 0) return null;
  const sorted = [...segments].sort((a, b) => a.startSec - b.startSec);
  let cur = sorted[0]!.class;
  for (const s of sorted) if (s.startSec <= t) cur = s.class;
  return cur;
}

export function ctaScore(pred: CtaFacts, truth: CtaFacts | null): number | null {
  if (truth === null) return null;
  if (!truth.present) return pred.present ? 0 : 1;
  if (!pred.present || pred.startSec === null || truth.startSec === null) return 0;
  const d = Math.abs(pred.startSec - truth.startSec);
  if (d <= 1.5) return 1;
  if (d <= 3) return 0.5;
  return 0;
}

export function scoreAnswer(answer: DigestEvalAnswer, labels: DigestEvalLabels): QuestionScores {
  const textHits = labels.textGrid.map((truth, k) => inIntervals(k + 0.5, answer.textIntervals) === truth);
  const classHits = labels.classGrid.map((truth, k) => classAt(k + 0.5, answer.segments) === truth);
  const hookChecks = [
    answer.hook.face === labels.hook.face,
    answer.hook.textOverlay === labels.hook.textOverlay,
    answer.hook.cutInFirst2s === labels.hook.cutInFirst2s,
    answer.hook.openingClass === labels.hook.openingClass,
  ];
  const mean = (xs: boolean[]) => (xs.length === 0 ? null : xs.filter(Boolean).length / xs.length);
  return {
    cutF1: cutF1(answer.cuts, labels.cuts),
    cutCount: cutCountScore(answer.cuts.length, labels.cuts.length),
    text: mean(textHits),
    hookText: wordF1(answer.hook.text, labels.hook.text),
    hook: mean(hookChecks),
    transitions: jaccard(answer.transitions, labels.transitions),
    shotClass: mean(classHits),
    cta: ctaScore(answer.cta, labels.cta),
  };
}

/** Mean of each question key over videos, ignoring nulls; `overall` = mean of the key means. */
export function aggregateScores(rows: QuestionScores[]): Record<QuestionKey | "overall", number | null> {
  const outRow = {} as Record<QuestionKey | "overall", number | null>;
  const keyMeans: number[] = [];
  for (const k of QUESTION_KEYS) {
    const vals = rows.map((r) => r[k]).filter((v): v is number => typeof v === "number");
    const m = vals.length === 0 ? null : round3(vals.reduce((a, b) => a + b, 0) / vals.length);
    outRow[k] = m;
    if (m !== null) keyMeans.push(m);
  }
  outRow.overall = keyMeans.length === 0 ? null : round3(keyMeans.reduce((a, b) => a + b, 0) / keyMeans.length);
  return outRow;
}

/** Points not dominated on (higher quality, lower cost). Input order preserved. */
export function paretoFront<T extends { quality: number; cost: number }>(points: T[]): T[] {
  return points.filter(
    (p) =>
      !points.some(
        (q) => q !== p && q.quality >= p.quality && q.cost <= p.cost && (q.quality > p.quality || q.cost < p.cost),
      ),
  );
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
