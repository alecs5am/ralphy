// Release-readiness scorecard Zod schema (#427).
//
// The scorecard is a deterministic AGGREGATOR — it does NOT re-run any gate. It
// reads the reports the other gates already persisted (eval.json, fidelity.json,
// council-polish.json, STYLE_LOCK.md, distribution-pack.json) plus the contract's
// `polished` determination and merges them into ONE mode-aware verdict that
// explains whether a Unit is shippable for its mode and why.
//
// Where the JSON lands: `<project>/scorecard.json` (append-only / auto-version,
// AGENTS.md #14). The verb is `ralphy project scorecard <id> [--mode <m>]`.
//
// Schema style mirrors `cli/lib/schemas/{council,distribution-pack,production-plan}.ts`:
// a Zod object with inline-doc comments, exported `z.infer` types, sane defaults
// so a best-effort assembly still parses, and a `parseScorecard()`. English-only-
// on-disk.

import { z } from "zod";

// ─── Dimensions ────────────────────────────────────────────────────────────────

/**
 * The twelve readiness dimensions (issue #427 Scope). Each is scored from a
 * SPECIFIC source artifact — the comment names which gate produces it. Append,
 * never repurpose.
 */
export const SCORECARD_DIMENSIONS = [
  "hook", // eval.json structure.hookZone + findings (structure.hook-zone-*)
  "clarity", // eval.json vision findings + scoring verdict
  "productFidelity", // fidelity.json blocksShip / verdict
  "styleFit", // STYLE_LOCK.md presence when requiresStyleLock(mode)
  "pacing", // eval.json scene durations + findings (structure.duration-drift / hook-zone-static)
  "audio", // eval.json audio findings (loudness / true-peak / dead-air)
  "captions", // eval.json caption findings (thin / dense / missing)
  "platformFit", // eval.json findings (format.aspect-ratio / resolution / fps)
  "originality", // council-polish.json verdict (block | revise | ship)
  "technicalPolish", // contract polished (native-video final gate) + eval gate.shipReady
  "distributionReadiness", // distribution-pack.json presence
  "residualRisk", // any remaining warn/fail signal not owned by a named dimension
] as const;
export type ScorecardDimension = (typeof SCORECARD_DIMENSIONS)[number];

/** Per-dimension status. `na` = the dimension does not apply / no artifact yet. */
export const DimensionStatusSchema = z.enum(["pass", "warn", "fail", "na"]);
export type DimensionStatus = z.infer<typeof DimensionStatusSchema>;

/**
 * One dimension's reading. `score` is 0-100 when an artifact yields a numeric
 * band, or null when the dimension is `na` (no source artifact) — a numeric
 * score is never fabricated for a missing input.
 */
export const DimensionEntrySchema = z.object({
  /** The dimension this entry scores. */
  dimension: z.enum(SCORECARD_DIMENSIONS),
  /** 0-100 readiness band, or null when `na` / no numeric signal. */
  score: z.number().min(0).max(100).nullable().default(null),
  /** pass | warn | fail | na. */
  status: DimensionStatusSchema,
  /** The artifact this reading came from (e.g. "eval.json", "fidelity.json"), or null when `na`. */
  source: z.string().nullable().default(null),
  /** One-line, English-on-disk explanation of the reading. */
  note: z.string().default(""),
});
export type DimensionEntry = z.infer<typeof DimensionEntrySchema>;

// ─── The top-level verdict ──────────────────────────────────────────────────────

/**
 * The scorecard's final call:
 *   • `ship`                — every REQUIRED dimension passes; safe to form a polished Unit.
 *   • `repair`              — a fixable signal (eval warn, fidelity warn, council revise) is present.
 *   • `needs-user-decision` — a genuine human-judgment gap (no blocking signal but a required
 *                             dimension is `na` / unverifiable) the agent must surface, not guess.
 *   • `blocked`             — a hard blocker (fidelity blocksShip, council block, eval fail,
 *                             native gate not passed) refuses ship.
 */
export const ScorecardVerdictSchema = z.enum([
  "ship",
  "repair",
  "needs-user-decision",
  "blocked",
]);
export type ScorecardVerdict = z.infer<typeof ScorecardVerdictSchema>;

export const ReadinessScorecardSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** The project this scorecard summarizes. */
  projectId: z.string().default(""),
  /** The content mode the thresholds were applied for (null = unclassified). */
  mode: z.string().nullable().default(null),
  /** ISO timestamp of assembly. */
  generatedAt: z.string().default(() => new Date().toISOString()),

  /** The final release-readiness call. */
  verdict: ScorecardVerdictSchema,
  /**
   * The contract's native-video-gated `polished` determination (#411), surfaced
   * verbatim so unit formation can consult one place. `true` only when the
   * native-video final gate passed (or a user bypass is logged); `false` after a
   * render with no passing native gate; `null` before any render/eval.
   */
  polished: z.boolean().nullable().default(null),
  /** One-line, English-on-disk reason for the verdict. */
  reason: z.string().default(""),
  /** The twelve per-dimension readings (stable order = SCORECARD_DIMENSIONS). */
  dimensions: z.array(DimensionEntrySchema).default([]),
  /**
   * The dimensions REQUIRED to pass for this mode before `ship` (the rest may be
   * `na` without blocking). Mirrors the mode-aware threshold decision so a reader
   * sees exactly which dimensions gated the verdict.
   */
  requiredDimensions: z.array(z.enum(SCORECARD_DIMENSIONS)).default([]),
});
export type ReadinessScorecard = z.infer<typeof ReadinessScorecardSchema>;

/** The project-relative location the scorecard is persisted to. */
export const SCORECARD_ARTIFACT = "scorecard.json" as const;

/**
 * Parse + validate an unknown value into a ReadinessScorecard. Throws a ZodError
 * on a malformed object. Callers mapping onto `E_VALIDATION_FAILED` should catch
 * and pass `error.message` as `detail`.
 */
export function parseScorecard(input: unknown): ReadinessScorecard {
  return ReadinessScorecardSchema.parse(input);
}
