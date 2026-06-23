// Creative-strategy Zod schema (#456) — the HYPOTHESIS layer above generation.
//
// The content-farm goal is not one perfect output; it is many controlled,
// purposeful attempts across hooks / personas / styles / CTAs / first-frames /
// music beds / platforms, with a system for choosing winners. #421 already owns
// the variant TOURNAMENT (the plan `VariantMatrix` + the outcome
// `TournamentResult` in `variant-matrix.ts`). What was missing is the STRATEGY
// that sits above it: WHY we are spending money — the audience, the offer, the
// testable hypothesis, the angle/hook/proof/objection/CTA, and which axes the
// batch should vary. Without it, variants are random volume instead of
// experiments (issue #456 Context).
//
// Three artifacts live here:
//   • CreativeStrategy   — the PLAN-OF-INTENT: audience segment(s), offer,
//     hypothesis, angle, hook, proof, objection, CTA, content mode, and
//     `variantAxes` (which axes to vary + how many slots each fans into). Written
//     BEFORE generation; reviewed by the council / plan grader (#456 §3).
//   • WinnerFeedback     — the LEARNING: the champion, the losing rationale, and
//     next-batch suggestions, folded back into the strategy (#456 §4).
//   • the BRIDGE         — `strategyToVariantMatrix()` lowers a strategy into a
//     VALID #421 `VariantMatrix` the tournament can execute (#456 §2).
//
// Schema style mirrors `cli/lib/schemas/{workflow,variant-matrix,scorecard}.ts`:
// a Zod object with inline-doc comments, exported `z.infer` types, sane
// `.default()`s so a partial / best-effort capture still parses, and a
// `parse*()` entry point. English-only-on-disk.

import { z } from "zod";
import {
  VariantMatrixSchema,
  type VariantMatrix,
  type VariantAxis,
} from "./variant-matrix.js";

// ─── Variant axes ────────────────────────────────────────────────────────────

/**
 * The closed set of axes a creative batch may vary (#456 §1 — "the axes to
 * vary"). These mirror the free-form axis labels the #421 matrix + the
 * postmortems already use, but the STRATEGY layer constrains them to a known
 * vocabulary so the council can reason about coverage and the bridge can emit
 * predictable slot names. Append, never repurpose.
 */
export const VARIANT_AXIS_KINDS = [
  "hook",
  "persona",
  "style",
  "cta",
  "first-frame",
  "music",
  "platform",
] as const;
export type VariantAxisKind = (typeof VARIANT_AXIS_KINDS)[number];

/**
 * One axis the strategy intends to vary. `kind` is the closed-vocabulary axis;
 * `hypothesis` is the testable claim this axis exists to validate ("a punchier
 * hook lifts 0-3s retention"); `slots` is how many variants to fan this axis
 * into (the count the tournament will rank); `options` optionally names the
 * concrete values to try (when known up front).
 */
export const StrategyVariantAxisSchema = z.object({
  /** The axis to vary (closed vocabulary, #456 §1). */
  kind: z.enum(VARIANT_AXIS_KINDS),
  /** The testable claim this axis varies to validate. */
  hypothesis: z.string().default(""),
  /** How many variants to fan this axis into (>=1; the slots the tournament ranks). */
  slots: z.number().int().positive().default(2),
  /** Concrete values to try on this axis, when known (else the agent fills them). */
  options: z.array(z.string()).default([]),
});
export type StrategyVariantAxis = z.infer<typeof StrategyVariantAxisSchema>;

// ─── Audience ─────────────────────────────────────────────────────────────────

/**
 * One audience segment the batch targets. A strategy may carry several (the
 * content-farm allocates budget across segments); the first is the primary.
 */
export const AudienceSegmentSchema = z.object({
  /** Short label for the segment ("cold-traffic devs", "returning DTC buyers"). */
  label: z.string().min(1),
  /** What this segment cares about / is trying to solve. */
  painPoint: z.string().default(""),
  /** Where this segment is reached (platform / placement), free-form. */
  platform: z.string().default(""),
});
export type AudienceSegment = z.infer<typeof AudienceSegmentSchema>;

// ─── CreativeStrategy (the plan-of-intent) ─────────────────────────────────────

export const CreativeStrategySchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** The base project / batch this strategy governs. */
  baseId: z.string().default(""),
  /** ISO timestamp the strategy was authored. */
  generatedAt: z.string().default(() => new Date().toISOString()),
  /**
   * The content mode this strategy produces for (a `CONTENT_MODES_LIST` id —
   * #412). Free-form string so the schema does not import the mode registry; the
   * bridge + tests use the supported set (ad-creative-pack, ugc-review,
   * social-carousel, product-shot, personal-clipper, …). Empty = unclassified.
   */
  contentMode: z.string().default(""),

  /** Audience segment(s) the batch targets. First = primary. */
  audience: z.array(AudienceSegmentSchema).default([]),
  /** The offer / value proposition being communicated. */
  offer: z.string().default(""),
  /**
   * The testable, batch-level claim the experiment exists to validate — the
   * thing winning variants prove ("a problem-mirror hook beats a benefit hook
   * for cold devs"). This is the strategy's spine (#456 §1).
   */
  hypothesis: z.string().default(""),
  /** The creative angle / framing (the through-line of every variant). */
  angle: z.string().default(""),
  /** The opening hook (0-3s scroll-stop). */
  hook: z.string().default(""),
  /** The proof / evidence that backs the offer (demo, stat, testimonial). */
  proof: z.string().default(""),
  /** The primary objection the creative must overcome. */
  objection: z.string().default(""),
  /** The call to action. */
  cta: z.string().default(""),

  /** The axes this batch varies, each with its hypothesis + slot count. */
  variantAxes: z.array(StrategyVariantAxisSchema).default([]),

  /**
   * Success criteria the variants are judged against before a champion is
   * declared (free-form, mode-aware — e.g. "scoreVideo >= 70", "hook-zone not
   * static"). These flow into the emitted matrix's eval criteria (#456 §2) and
   * map onto the readiness verdict vocabulary in `scorecard.ts` (#427).
   */
  successCriteria: z.array(z.string()).default([]),

  /**
   * Accumulated learnings from prior batches (most-recent first) — every
   * `applyWinnerFeedback` appends one entry here, so the strategy carries its own
   * history (#456 §4). Append-only; AGENTS.md #14.
   */
  history: z.array(z.lazy(() => WinnerFeedbackSchema)).default([]),
});
export type CreativeStrategy = z.infer<typeof CreativeStrategySchema>;

// ─── WinnerFeedback (the learning) ─────────────────────────────────────────────

/** One losing variant preserved with the reason it lost (mirrors the #421 loser). */
export const LosingRationaleSchema = z.object({
  /** The variant's id (project id / slot / slug). */
  variantId: z.string().min(1),
  /** The axis that variant varied (closed vocabulary), when known. */
  axis: z.enum(VARIANT_AXIS_KINDS).optional(),
  /** Why this variant did NOT win — the rationale #456 §4 requires preserved. */
  rationale: z.string().default(""),
});
export type LosingRationale = z.infer<typeof LosingRationaleSchema>;

export const WinnerFeedbackSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** The batch / base id this feedback summarizes. */
  baseId: z.string().default(""),
  /** ISO timestamp the feedback was recorded. */
  generatedAt: z.string().default(() => new Date().toISOString()),
  /** The winning variant's id (the champion the tournament picked). */
  champion: z.string().default(""),
  /** Which axis the champion's edge came from (closed vocabulary), when known. */
  winningAxis: z.enum(VARIANT_AXIS_KINDS).optional(),
  /** One-line reason the champion won (what the hypothesis confirmed/refuted). */
  winRationale: z.string().default(""),
  /** The preserved losers, each with the reason it lost. */
  losers: z.array(LosingRationaleSchema).default([]),
  /**
   * Concrete directions for the next batch (the loop's payload, #456 §4): which
   * axis to double down on, which hypothesis to retire, what to try next.
   */
  nextBatchSuggestions: z.array(z.string()).default([]),
});
export type WinnerFeedback = z.infer<typeof WinnerFeedbackSchema>;

// ─── Durable filenames ─────────────────────────────────────────────────────────

/** The durable filename a creative strategy is persisted to (#456 §1). */
export const CREATIVE_STRATEGY_FILENAME = "creative-strategy.json" as const;

// ─── Parse entry points ─────────────────────────────────────────────────────────

/** Parse + validate an unknown value into a CreativeStrategy. Throws a ZodError. */
export function parseCreativeStrategy(input: unknown): CreativeStrategy {
  return CreativeStrategySchema.parse(input);
}

/** Parse + validate an unknown value into a WinnerFeedback. Throws a ZodError. */
export function parseWinnerFeedback(input: unknown): WinnerFeedback {
  return WinnerFeedbackSchema.parse(input);
}

// ─── The variant-matrix bridge (#456 §2) ───────────────────────────────────────

/**
 * Lower a `CreativeStrategy` into a VALID #421 `VariantMatrix` the tournament
 * (`ralphy batch tournament`) can execute. This is the §"variant matrix" bridge:
 * each strategy `variantAxis` becomes one matrix `VariantAxis`, carrying:
 *   • `axis`            — the closed-vocabulary axis kind (free-form on the matrix).
 *   • `hypothesis`      — the axis's testable claim (falls back to the strategy's).
 *   • `slots`           — generated slot names `<baseId>-<axis>-<n>` (1-based), one
 *                         per intended variant; the matrix slots are plain strings.
 *   • `expectedCostUsd` — `slots × perSlotCostUsd` (the estimate idiom #421 uses).
 *
 * The matrix carries the strategy's `successCriteria` indirectly: they are NOT a
 * field on the #421 schema, so the bridge bakes the eval criteria into the
 * top-level matrix the only way the existing schema allows — as the rolled-up
 * `totalExpectedCostUsd` plus per-axis hypotheses; the agent layer reads the
 * strategy's `successCriteria` alongside. The output is parsed through the REAL
 * `VariantMatrixSchema`, so a caller can trust it round-trips (#456 §2 + the
 * test that proves compatibility).
 *
 * @param strategy        the authored creative strategy.
 * @param perSlotCostUsd  estimated USD per generated slot (default 0; the agent
 *                        passes the mode's per-gen estimate).
 */
export function strategyToVariantMatrix(
  strategy: CreativeStrategy,
  perSlotCostUsd = 0,
): VariantMatrix {
  const axes: VariantAxis[] = strategy.variantAxes.map((a) => {
    const slots = Array.from(
      { length: a.slots },
      (_unused, i) => `${strategy.baseId || "base"}-${a.kind}-${i + 1}`,
    );
    return {
      axis: a.kind,
      hypothesis: a.hypothesis || strategy.hypothesis,
      slots,
      expectedCostUsd: slots.length * perSlotCostUsd,
    };
  });

  const totalExpectedCostUsd = axes.reduce((sum, a) => sum + a.expectedCostUsd, 0);

  // Parse through the REAL schema so the output is provably a valid VariantMatrix.
  return VariantMatrixSchema.parse({
    baseId: strategy.baseId,
    generatedAt: strategy.generatedAt,
    axes,
    totalExpectedCostUsd,
  });
}

// ─── The winner-feedback loop (#456 §4) ─────────────────────────────────────────

/**
 * Fold a tournament's `WinnerFeedback` back into the strategy — a PURE update
 * that returns a NEW strategy (never mutates the input, AGENTS.md #14
 * append-only spirit). The feedback is prepended to `history` (most-recent
 * first); the winning axis's hypothesis is annotated as confirmed so the next
 * batch can double down; and the feedback's `nextBatchSuggestions` are surfaced
 * back into `successCriteria` so the next planning pass inherits them.
 *
 * It does NOT re-roll axes or change slot counts — that is a human/agent
 * decision the next planning pass makes by reading `history`. This function only
 * RECORDS the learning so the loop closes.
 */
export function applyWinnerFeedback(
  strategy: CreativeStrategy,
  feedback: WinnerFeedback,
): CreativeStrategy {
  const variantAxes = strategy.variantAxes.map((a) =>
    feedback.winningAxis && a.kind === feedback.winningAxis
      ? {
          ...a,
          hypothesis: feedback.winRationale
            ? `confirmed: ${feedback.winRationale}`
            : a.hypothesis,
        }
      : a,
  );

  // Surface next-batch suggestions as additive success criteria (deduped).
  const successCriteria = [
    ...new Set([...strategy.successCriteria, ...feedback.nextBatchSuggestions]),
  ];

  return {
    ...strategy,
    variantAxes,
    successCriteria,
    history: [feedback, ...strategy.history],
  };
}
