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

import path from "node:path";
import {
  VariantMatrixSchema,
  TournamentResultSchema,
  type VariantMatrix,
  type TournamentEntry,
  type TournamentLoser,
  type TournamentResult,
} from "./schemas/variant-matrix.js";

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
}

/** What a scorer returns for one candidate. Higher `score` is better. */
export interface ScoreOutcome {
  score: number;
  reasons: string[];
}

/** A scorer is any fn candidate → outcome. Injected by the verb; mode-agnostic. */
export type ScoreFn = (candidate: TournamentCandidate) => Promise<ScoreOutcome>;

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
}

/**
 * Score every candidate, rank descending, pick the champion, and PRESERVE every
 * non-champion as a loser with a rationale. Ties break deterministically by
 * `variantId` so the ranking is stable. The losers are NEVER dropped — this
 * mirrors what stays on disk under the append-only contract.
 */
export async function runTournament(input: RunTournamentInput): Promise<TournamentResult> {
  const scored: TournamentEntry[] = [];
  for (const c of input.candidates) {
    const outcome = await input.scoreFn(c);
    scored.push({
      variantId: c.variantId,
      mediaPath: c.mediaPath,
      axis: c.axis ?? "",
      score: outcome.score,
      reasons: outcome.reasons ?? [],
      cost: c.cost ?? 0,
    });
  }

  // Rank: score descending, then variantId ascending for a stable tie-break.
  scored.sort((a, b) => b.score - a.score || a.variantId.localeCompare(b.variantId, "en"));
  const ranked = scored.map((e, i) => ({ ...e, rank: i + 1 }));

  const champion = ranked.length > 0 ? ranked[0]! : null;

  // Every non-champion is a preserved loser with a rationale relative to the
  // champion. Deterministic, no model call — the score gap IS the rationale.
  const losers: TournamentLoser[] = ranked.slice(1).map((e) => ({
    ...e,
    rationale: champion
      ? `Lost to ${champion.variantId} (score ${e.score} vs ${champion.score}). Preserved on disk for future prompts/postmortems.`
      : "Preserved on disk for future prompts/postmortems.",
  }));

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
