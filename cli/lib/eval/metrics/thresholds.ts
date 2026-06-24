// Per-adapter threshold resolution (#485).
//
// Each metric adapter has an in-code DEFAULT threshold. A workspace/global
// config override at `metrics.<adapterId>.threshold` (read through
// global-config's dot-path getter) wins when present and numeric. An optional
// per-mode override map under `metrics.<adapterId>.byMode.<mode>` is consulted
// first, falling back to the flat key, then the in-code default.
//
// Documented defaults:
//   • tts-wer          → 0.15  (≤15% Word Error Rate is a pass; ≤2× warn; else fail)
//   • image-aesthetic  → 0.5   (a 0..1 aesthetic/alignment score; ≥thr pass — only
//                               meaningful once a scorer is configured; until then
//                               the adapter is `na`).

import { configGet } from "../../global-config.js";

/** In-code default thresholds per adapter id. */
export const DEFAULT_THRESHOLDS: Record<string, number> = {
  "tts-wer": 0.15,
  "image-aesthetic": 0.5,
};

/**
 * Resolve the threshold for an adapter. Precedence:
 *   1. config `metrics.<id>.byMode.<mode>` (per-mode override), when numeric
 *   2. config `metrics.<id>.threshold` (flat override), when numeric
 *   3. the in-code DEFAULT_THRESHOLDS[id]
 *   4. NaN-safe fallback 0 (only when the id is unknown — callers pass known ids)
 *
 * PURE over config + the in-code map; no model calls.
 */
export function thresholdFor(adapterId: string, mode?: string | null): number {
  if (mode) {
    const perMode = configGet(`metrics.${adapterId}.byMode.${mode}`);
    if (typeof perMode === "number" && Number.isFinite(perMode)) return perMode;
  }
  const flat = configGet(`metrics.${adapterId}.threshold`);
  if (typeof flat === "number" && Number.isFinite(flat)) return flat;
  const def = DEFAULT_THRESHOLDS[adapterId];
  return typeof def === "number" ? def : 0;
}
