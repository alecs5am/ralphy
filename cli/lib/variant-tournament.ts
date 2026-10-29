// Variant tournament — the DECISION layer over the existing variation pieces
// (#421). `batch vary` (#024) CREATES variants on an axis; `buildBatchReview`
// (#410) AGGREGATES winners/failures/cost across a batch. This module RANKS the
// variants, picks a CHAMPION, attributes the win to a hypothesis/axis, and
// PRESERVES the losers with a rationale — it never deletes a losing variant
// (AGENTS.md #14: losers are training data for future prompts/postmortems).
//
// Two pure pieces + two scorer modes:
//
//   • buildVariantMatrix(spec)        — turn a tournament spec (axes + hypotheses
//                                       + slots) into the VARIANT_MATRIX plan,
//                                       estimating expected cost via the plan
//                                       cost helpers where a slot is a model slot.
//   • runTournament({candidates,scoreFn}) — score every candidate via the
//                                       INJECTABLE scoreFn, rank descending, pick
//                                       the champion, and return the ranked
//                                       entries + the preserved losers.
//
// The runner is MODE-AGNOSTIC: the verb wires the chosen scorer.
//   • CHEAP / manual mode  — `manualScorer(scores)`: scores supplied by the
//     caller (a `scores.json` map). No model call.
//   • MODEL-ASSISTED mode  — `modelAssistedScorer(deps)`: wraps the native-video
//     eval for video candidates and `scoreImage` for stills. Both are injected
//     so fixtures need no paid generation / network.
//
// ORIGINALITY GATE (#561): each candidate may carry the substantive axes it
// changed and an optional cosmetic last layer (cli/lib/variant-planner.ts).
// After ranking, best first, a candidate whose declared changes are cosmetic
// only, or whose injected `siblingCheck` reads likely-duplicate against a
// higher-ranked emitted sibling, is REFUSED: it stays in `ranked` / `losers`
// (and on disk) but is not emitted. A refusal can be overridden per variant
// with a reason the verb logs. The champion is the best emitted candidate.

import path from "node:path";
import {
  VariantMatrixSchema,
  TournamentResultSchema,
  type SiblingComparison,
  type VariantMatrix,
  type VariantRefusal,
  type TournamentEntry,
  type TournamentLoser,
  type TournamentResult,
} from "./schemas/variant-matrix.js";
import { classifyAxis, uniquenessOf, type PlannedVariant } from "./variant-planner.js";

// ─── Candidate + scorer types ────────────────────────────────────────────────

/** One thing to score. `kind` routes the model-assisted scorer (image vs video). */
export interface TournamentCandidate {
  /** Stable id (project id / slot / slug). Unique within a tournament. */
  variantId: string;
  /** The artifact to score (a still or a clip). */
  mediaPath: string;
  /** Media kind — drives the model-assisted scorer's branch. */
  kind: "image" | "video";
  /** The matrix axis this variant varies (free-form), when known. */
  axis?: string;
  /** The prompt that produced it (fed into fidelity scoring), when known. */
  prompt?: string;
  /** USD already spent producing this variant (from the gen-log / manifest). */
  cost?: number;
  /** #561: substantive axes this variant changed (planner / scenario). */
  changedAxes?: string[];
  /** #561: cosmetic last layer applied on top (never counted as uniqueness). */
  cosmeticLayer?: string[];
}

/**
 * #561: what the sibling originality gate reports for one candidate against
 * one higher-ranked sibling. The verb wires `ralphy unit originality`'s local
 * fingerprint comparison; tests inject canned outcomes.
 */
export interface SiblingCheckOutcome {
  verdict: "likely-duplicate" | "similar" | "original";
  visual: number | null;
  audio: number | null;
  script: number | null;
  reasons: string;
}

/** Returns the comparison, `{ error }` when media cannot be read, or null to skip. */
export type SiblingCheckFn = (
  candidate: TournamentCandidate,
  sibling: TournamentCandidate,
) => Promise<SiblingCheckOutcome | { error: string } | null>;

/** What a scorer returns for one candidate. Higher `score` is better. */
export interface ScoreOutcome {
  score: number;
  reasons: string[];
}

/** A scorer is any fn candidate → outcome. Injected by the verb; mode-agnostic. */
export type ScoreFn = (candidate: TournamentCandidate) => Promise<ScoreOutcome>;

// HOOK-SCORE WEIGHTING (#440): for VIDEO candidates the first-frame hook gate
// (`checkFirstFrameHook`, cli/lib/eval/hook.ts) exposes a single 0-100 `hookScore`
// on the same scale as the scores below. A scroll-stop-weighted scorer can read
// it (run the gate per candidate, blend its `hookScore` with the model-assisted
// asset score) so the tournament champion is the strongest OPENER, not just the
// best whole-clip render. Left as a documented seam — the default
// `modelAssistedScorer` stays whole-asset; wire a custom ScoreFn to weight it.

// ─── buildVariantMatrix (the plan) ─────────────────────────────────────────────

/** A spec axis the matrix is built from (the cost is estimated, not supplied). */
export interface MatrixSpecAxis {
  axis: string;
  hypothesis?: string;
  slots?: string[];
  /**
   * Per-slot USD to generate one variant on this axis. When omitted, the matrix
   * records 0 expected cost for the axis (an unpriced / manual-asset axis).
   */
  perSlotCostUsd?: number;
}

export interface MatrixSpec {
  /** The batch / base project the matrix plans variants for. */
  baseId: string;
  axes: MatrixSpecAxis[];
  /** #561: planned variants from `planVariants()` (substantive axes per variant). */
  variants?: PlannedVariant[];
}

/**
 * Build a VARIANT_MATRIX from a tournament spec. PURE — no network, no disk.
 * Expected cost per axis = `perSlotCostUsd × slots.length` (so the matrix mirrors
 * the plan cost idiom: one pass per slot, the re-roll budget lives in the
 * production plan's `estimate`, not here). The roll-up sums the axes.
 */
export function buildVariantMatrix(spec: MatrixSpec): VariantMatrix {
  const axes = spec.axes.map((a) => {
    const slots = a.slots ?? [];
    const perSlot = a.perSlotCostUsd ?? 0;
    const expectedCostUsd = Number((perSlot * slots.length).toFixed(2));
    return {
      axis: a.axis,
      hypothesis: a.hypothesis ?? "",
      slots,
      expectedCostUsd,
      kind: classifyAxis(a.axis),
    };
  });
  const totalExpectedCostUsd = Number(
    axes.reduce((s, a) => s + a.expectedCostUsd, 0).toFixed(2),
  );
  return VariantMatrixSchema.parse({
    version: 1,
    baseId: spec.baseId,
    generatedAt: new Date().toISOString(),
    axes,
    totalExpectedCostUsd,
    variants: spec.variants ?? [],
  });
}

// ─── runTournament (the ranking runner) ─────────────────────────────────────────

export interface RunTournamentInput {
  /** The base / batch id the tournament ran over (recorded on the result). */
  baseId?: string;
  /** The candidates to rank. */
  candidates: TournamentCandidate[];
  /** The injectable scorer (manual or model-assisted). */
  scoreFn: ScoreFn;
  /** Which mode the wired scorer is — recorded on the result for provenance. */
  scorer?: "manual" | "model-assisted";
  /**
   * #561: sibling originality gate. When wired, each candidate (best first) is
   * compared with every higher-ranked EMITTED sibling; a likely-duplicate is
   * refused (kept on disk, never shipped as a separate piece).
   */
  siblingCheck?: SiblingCheckFn;
  /** #561: variantId → the user's reason for emitting a refused variant anyway. */
  allowDuplicates?: Record<string, string>;
}

/**
 * Score every candidate, rank descending, pick the champion, and PRESERVE every
 * non-champion as a loser with a rationale. Ties break deterministically by
 * `variantId` so the ranking is stable. The losers are NEVER dropped — this
 * mirrors what stays on disk under the append-only contract.
 */
export async function runTournament(input: RunTournamentInput): Promise<TournamentResult> {
  const scored: TournamentEntry[] = [];
  const byId = new Map<string, TournamentCandidate>();
  for (const c of input.candidates) {
    byId.set(c.variantId, c);
    const outcome = await input.scoreFn(c);
    scored.push({
      variantId: c.variantId,
      mediaPath: c.mediaPath,
      axis: c.axis ?? "",
      score: outcome.score,
      reasons: outcome.reasons ?? [],
      cost: c.cost ?? 0,
      changedAxes: c.changedAxes ?? [],
      cosmeticLayer: c.cosmeticLayer ?? [],
    });
  }

  // Rank: score descending, then variantId ascending for a stable tie-break.
  scored.sort((a, b) => b.score - a.score || a.variantId.localeCompare(b.variantId, "en"));
  const ranked = scored.map((e, i) => ({ ...e, rank: i + 1 }));

  // #561 originality gate, best first: a variant is emitted only when it
  // changes something substantive (when its changes are known) and does not
  // read as a likely duplicate of a higher-ranked emitted sibling.
  const emitted: TournamentEntry[] = [];
  const refused: VariantRefusal[] = [];
  const overrides: VariantRefusal[] = [];
  const comparisons: SiblingComparison[] = [];
  const unchecked: Array<{ variantId: string; reason: string }> = [];
  const allow = input.allowDuplicates ?? {};
  for (const entry of ranked) {
    const candidate = byId.get(entry.variantId)!;
    let refusal: VariantRefusal | null = null;
    const declared = [...(candidate.changedAxes ?? []), ...(candidate.cosmeticLayer ?? [])];
    if (declared.length > 0) {
      const summary = uniquenessOf(declared);
      if (summary.substantive.length === 0 && summary.cosmetic.length > 0) {
        refusal = {
          variantId: entry.variantId,
          reason: "cosmetic-only",
          sibling: null,
          detail: `only cosmetic changes (${summary.cosmetic.join(", ")}); cosmetic transforms never count as uniqueness`,
          overrideReason: null,
        };
      }
    }
    if (!refusal && input.siblingCheck) {
      for (const kept of emitted) {
        const outcome = await input.siblingCheck(candidate, byId.get(kept.variantId)!);
        if (outcome === null) continue;
        if ("error" in outcome) {
          if (!unchecked.some((u) => u.variantId === entry.variantId)) unchecked.push({ variantId: entry.variantId, reason: outcome.error });
          break;
        }
        comparisons.push({ variantId: entry.variantId, sibling: kept.variantId, ...outcome });
        if (outcome.verdict === "likely-duplicate") {
          refusal = {
            variantId: entry.variantId,
            reason: "duplicate-of-sibling",
            sibling: kept.variantId,
            detail: outcome.reasons,
            overrideReason: null,
          };
          break;
        }
      }
    }
    if (!refusal) {
      emitted.push(entry);
    } else if (allow[entry.variantId]) {
      overrides.push({ ...refusal, overrideReason: allow[entry.variantId]! });
      emitted.push(entry);
    } else {
      refused.push(refusal);
    }
  }

  // The champion is the best EMITTED variant; with no gate wired that is
  // always ranked[0] (the #421 behaviour).
  const champion = emitted.length > 0 ? emitted[0]! : null;
  const refusedById = new Map(refused.map((r) => [r.variantId, r]));

  // Every non-champion is a preserved loser with a rationale relative to the
  // champion. Deterministic, no model call — the score gap IS the rationale.
  const losers: TournamentLoser[] = ranked
    .filter((e) => e.variantId !== champion?.variantId)
    .map((e) => {
      const refusal = refusedById.get(e.variantId);
      const base = champion
        ? `Lost to ${champion.variantId} (score ${e.score} vs ${champion.score}).`
        : "No emitted champion.";
      const why = refusal
        ? ` Refused (${refusal.reason}${refusal.sibling ? ` of ${refusal.sibling}` : ""}).`
        : "";
      return { ...e, rationale: `${base}${why} Preserved on disk for future prompts/postmortems.` };
    });

  const byVariant = ranked.map((e) => ({ variantId: e.variantId, cost: e.cost }));
  const totalUsd = Number(byVariant.reduce((s, e) => s + e.cost, 0).toFixed(2));

  return TournamentResultSchema.parse({
    version: 1,
    baseId: input.baseId ?? "",
    generatedAt: new Date().toISOString(),
    scorer: input.scorer ?? "manual",
    ranked,
    champion,
    losers,
    emitted: emitted.map((e) => e.variantId),
    refused,
    overrides,
    originality: { checked: Boolean(input.siblingCheck), comparisons, unchecked },
    cost: { totalUsd, byVariant },
  });
}

// ─── CHEAP / manual scorer ──────────────────────────────────────────────────────

/**
 * A manual scorer backed by a caller-supplied map (`scores.json`). The map is
 * `variantId → number` OR `variantId → { score, reasons? }`. No model call —
 * this is the cheap mode for manual visual review (the user eyeballs the
 * variants, records a score per id, and the runner does the bookkeeping).
 * Missing ids score 0 with a "no manual score supplied" reason.
 */
export function manualScorer(
  scores: Record<string, number | { score: number; reasons?: string[] }>,
): ScoreFn {
  return async (c) => {
    const raw = scores[c.variantId];
    if (raw === undefined) {
      return { score: 0, reasons: ["no manual score supplied for this variant"] };
    }
    if (typeof raw === "number") {
      return { score: raw, reasons: [`manual score ${raw}`] };
    }
    return { score: raw.score, reasons: raw.reasons ?? [`manual score ${raw.score}`] };
  };
}

// ─── MODEL-ASSISTED scorer ──────────────────────────────────────────────────────

/**
 * The asset-quality shape the model-assisted scorer consumes. A subset of
 * `AssetCheck` (cli/lib/quality.ts) — we only need the per-axis scores + comment.
 */
export interface AssetScore {
  scores: { clarity: number; composition: number; fidelity: number; motion?: number };
  comment?: string;
}

/**
 * Injectable model scorers. In production the verb wires `scoreImageFn` to
 * `scoreImage` (cli/lib/quality.ts) and `scoreVideoFn` to a wrapper over the
 * native-video eval; tests inject canned outcomes so NO paid generation runs.
 */
export interface ModelAssistedDeps {
  scoreImageFn: (input: { imagePath: string; prompt: string }) => Promise<AssetScore>;
  scoreVideoFn: (input: { videoPath: string; prompt: string }) => Promise<AssetScore>;
}

/**
 * A model-assisted scorer: stills go through `scoreImageFn`, clips through
 * `scoreVideoFn` (the native-video eval). The candidate `kind` routes the branch.
 * The 0-10 sub-scores are averaged into a single 0-100 figure so manual (0-100)
 * and model-assisted scores rank on the same scale; the sub-scores ride along in
 * `reasons` so the ranking stays auditable.
 */
export function modelAssistedScorer(deps: ModelAssistedDeps): ScoreFn {
  return async (c) => {
    const asset =
      c.kind === "video"
        ? await deps.scoreVideoFn({ videoPath: c.mediaPath, prompt: c.prompt ?? "" })
        : await deps.scoreImageFn({ imagePath: c.mediaPath, prompt: c.prompt ?? "" });

    const parts = [asset.scores.clarity, asset.scores.composition, asset.scores.fidelity];
    if (typeof asset.scores.motion === "number") parts.push(asset.scores.motion);
    const avg10 = parts.reduce((s, n) => s + n, 0) / parts.length;
    const score = Number((avg10 * 10).toFixed(1)); // 0-10 → 0-100

    const reasons: string[] = [
      `clarity ${asset.scores.clarity}/10`,
      `composition ${asset.scores.composition}/10`,
      `fidelity ${asset.scores.fidelity}/10`,
    ];
    if (typeof asset.scores.motion === "number") reasons.push(`motion ${asset.scores.motion}/10`);
    if (asset.comment) reasons.push(asset.comment);

    return { score, reasons };
  };
}

// ─── Candidate-discovery helper (used by the verb) ───────────────────────────────

/**
 * Resolve the media kind from a file extension. Images vs everything-else-is-
 * video; used when discovering candidates off a batch's variant projects.
 */
export function kindForMedia(mediaPath: string): "image" | "video" {
  const ext = path.extname(mediaPath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext) ? "image" : "video";
}
