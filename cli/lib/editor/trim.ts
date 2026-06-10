// Pure helpers for `ralphy editor trim-analyze` — extracted from
// cli/commands/editor.ts so the prompt builder, summary.json shape, and
// idempotency check are unit-testable without spawning LLMs (#034).

import fs from "node:fs/promises";
import path from "node:path";

/**
 * One row in the aggregated trim-analysis summary. The clip-level JSON files
 * carry the full vision output; this summary keeps just the editor-actionable
 * fields plus the source path / mtime for idempotency on the next run.
 */
export type TrimAnalysisRow = {
  /** Slot id derived from the clip filename (e.g. "scene-01-vid"). */
  slot: string;
  /** Absolute path to the source clip on disk. */
  clipPath: string;
  /** mtime (ms since epoch) of the clip at analysis time. Used for idempotency. */
  clipMtimeMs: number;
  /** Path the per-clip analysis JSON was written to. */
  analysisPath: string;
  /** ISO timestamp when the analysis row was produced. */
  analyzedAt: string;
  /** Vision-model id used (e.g. "google/gemini-3.1-pro-preview"). */
  model: string;
  /** Dead-time at the head of the clip, seconds. */
  deadHeadSec?: number;
  /** Dead-time at the tail of the clip, seconds. */
  deadTailSec?: number;
  /** Suggested trim-in (seconds from start). Optional — model may omit. */
  trimInSec?: number;
  /** Suggested trim-out (seconds from start). Optional — model may omit. */
  trimOutSec?: number;
  /** Suggested max trim total, seconds. */
  maxTrimSec?: number;
  /** Which end to trim from: head / tail / both. */
  trimFrom?: "head" | "tail" | "both";
  /** Timestamped hot-moments — actions / cuts / beats the editor should pivot on. */
  hotMoments?: Array<{ t: number; intensity?: "low" | "medium" | "high"; what?: string }>;
  /** Optional model-observed duration (may differ from ffprobe truth). */
  observedDurationSec?: number;
};

/** Shape of `artifacts/analysis/summary.json`. */
export type TrimAnalysisSummary = {
  /** Schema version — bump on breaking shape changes. */
  schemaVersion: 1;
  /** Project id this summary belongs to. */
  project: string;
  /** ISO timestamp this summary was last written. */
  generatedAt: string;
  /** Vision model id used for the run. */
  model: string;
  /** Per-clip rows, sorted by slot. */
  clips: TrimAnalysisRow[];
};

/**
 * Trim-analysis prompt. Stable across versions — every clip gets the same
 * instructions so the summary rows are comparable across runs.
 *
 * Returned as a string (not a template literal mid-function) so unit tests can
 * assert on its content and a downstream caller can hash it for cache keys.
 */
export function buildTrimAnalysisPrompt(): string {
  return `You are analyzing ONE short video clip for editor-stage trim decisions.

Return ONLY this JSON object (no preamble, no fences):
{
  "observed_duration_sec": <number — what you actually see, NOT what the file claims>,
  "dead_head_sec": <number — seconds of static / pre-action / loading at the START>,
  "dead_tail_sec": <number — seconds of static / lingering / wind-down at the END>,
  "best_subwindow": { "start": <number>, "end": <number> },
  "trim_recommendation": {
    "max_trim_sec": <number — total seconds we could safely cut>,
    "trim_in_s": <number — recommended trim-in offset from start>,
    "trim_out_s": <number — recommended trim-out offset from start>,
    "trim_from": "head" | "tail" | "both"
  },
  "hot_moments": [ { "t": <sec>, "intensity": "low" | "medium" | "high", "what": "<one-line>" } ]
}

Calibration: PRESERVING > AGGRESSIVE. If unsure, recommend LESS trim. hot_moments[] is the choreography map — every visible action / cut / camera-move gets a row.`;
}

/**
 * Convert raw vision-model JSON (whatever shape the model returned) into a
 * normalized `TrimAnalysisRow`. Defensive: any missing field becomes `undefined`
 * rather than throwing — we'd rather a partial row in the summary than nothing.
 */
export function normalizeTrimAnalysisJson(
  raw: unknown,
  meta: {
    slot: string;
    clipPath: string;
    clipMtimeMs: number;
    analysisPath: string;
    model: string;
    analyzedAt?: string;
  },
): TrimAnalysisRow {
  const j = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const trimRec = (j.trim_recommendation && typeof j.trim_recommendation === "object"
    ? (j.trim_recommendation as Record<string, unknown>)
    : {});
  const hotRaw = Array.isArray(j.hot_moments)
    ? j.hot_moments
    : Array.isArray(j.beats)
      ? j.beats
      : [];
  const hot = (hotRaw as Array<Record<string, unknown>>)
    .map((m) => ({
      t: Number(m.t),
      intensity: (m.intensity as TrimAnalysisRow["hotMoments"] extends Array<infer R> ? R extends { intensity?: infer I } ? I : never : never) ?? undefined,
      what: typeof m.what === "string" ? m.what : undefined,
    }))
    .filter((m) => Number.isFinite(m.t));
  const trimFromVal = trimRec.trim_from;
  const trimFrom: TrimAnalysisRow["trimFrom"] =
    trimFromVal === "head" || trimFromVal === "tail" || trimFromVal === "both" ? trimFromVal : undefined;
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    slot: meta.slot,
    clipPath: meta.clipPath,
    clipMtimeMs: meta.clipMtimeMs,
    analysisPath: meta.analysisPath,
    analyzedAt: meta.analyzedAt ?? new Date().toISOString(),
    model: meta.model,
    deadHeadSec: num(j.dead_head_sec),
    deadTailSec: num(j.dead_tail_sec),
    trimInSec: num(trimRec.trim_in_s),
    trimOutSec: num(trimRec.trim_out_s),
    maxTrimSec: num(trimRec.max_trim_sec),
    trimFrom,
    hotMoments: hot.length > 0 ? (hot as TrimAnalysisRow["hotMoments"]) : undefined,
    observedDurationSec: num(j.observed_duration_sec),
  };
}

/**
 * Decide whether a clip needs re-analysis. Idempotency rule (#034):
 *   - if no prior summary row exists → analyze.
 *   - if prior row's clipMtimeMs >= current clip mtime → skip (cached).
 *   - if prior row's clipMtimeMs <  current clip mtime → re-analyze.
 *
 * (Strictly: we cache when the analysis is at least as fresh as the clip. The
 * summary.json mtime check in the issue maps to per-row mtime here, which is
 * more granular — one stale clip doesn't invalidate the whole summary.)
 */
export function needsAnalysis(
  clipMtimeMs: number,
  priorRow: TrimAnalysisRow | undefined,
): boolean {
  if (!priorRow) return true;
  return priorRow.clipMtimeMs < clipMtimeMs;
}

/**
 * Slot id from the clip filename. `scene-01-vid.mp4` → `scene-01-vid`.
 * Falls back to the bare filename without extension for non-conformant names.
 */
export function slotFromClipPath(clipPath: string): string {
  return path.basename(clipPath, path.extname(clipPath));
}

/**
 * Load an existing summary.json from disk, or return an empty seed. Never
 * throws on missing / malformed JSON — `loadOrSeedSummary` is a "what do I
 * have already" lookup, not a validation step.
 */
export async function loadOrSeedSummary(
  summaryPath: string,
  project: string,
  model: string,
): Promise<TrimAnalysisSummary> {
  try {
    const raw = await fs.readFile(summaryPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.clips)) {
      return parsed as TrimAnalysisSummary;
    }
  } catch {
    /* missing / malformed → seed */
  }
  return {
    schemaVersion: 1,
    project,
    generatedAt: new Date().toISOString(),
    model,
    clips: [],
  };
}

/**
 * Merge a new row into the summary, replacing any existing row with the same
 * slot. Sort by slot for stable JSON output.
 */
export function upsertRow(
  summary: TrimAnalysisSummary,
  row: TrimAnalysisRow,
): TrimAnalysisSummary {
  const others = summary.clips.filter((c) => c.slot !== row.slot);
  const clips = [...others, row].sort((a, b) => a.slot.localeCompare(b.slot));
  return { ...summary, clips, generatedAt: new Date().toISOString() };
}
