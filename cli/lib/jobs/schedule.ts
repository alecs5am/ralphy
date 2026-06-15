// Endpoint/model-aware dispatch decision (#428 part D) — PURE function.
//
// The worker's tick() loop wants to claim pending jobs up to the global
// concurrency cap. Some kinds (the OpenRouter `generate.image` path) trip
// burst-caps when fired too fast / too wide. This module decides WHICH kinds
// may claim a slot this tick, given the live running counts and the last
// dispatch timestamp per kind. It spawns nothing and touches no DB — the
// worker calls it, then claims only within the returned kinds.
//
// Behavior-preserving defaults are non-negotiable: an unconfigured queue
// returns every kind as dispatchable (cap = global concurrency, minInterval =
// 0), so the worker behaves EXACTLY as before this module existed.

import type { JobKind } from "./types.js";

/** Per-kind scheduling knobs. Omitted fields fall back to behavior-preserving defaults. */
export type KindScheduleConfig = {
  /** Max concurrent jobs of this kind. Default: the global concurrency cap. */
  maxConcurrent?: number;
  /** Min ms between two dispatches of this kind. Default: 0 (no throttle). */
  minIntervalMs?: number;
};

export type ScheduleConfig = {
  /** Outer bound — the daemon's global slot count. */
  globalConcurrency: number;
  /** Per-kind overrides. Any kind absent here uses the defaults. */
  perKind?: Partial<Record<JobKind, KindScheduleConfig>>;
};

/**
 * Default per-kind config. EMPTY by design: leaving this empty means every
 * kind inherits cap = globalConcurrency and minInterval = 0, i.e. exactly the
 * pre-#428 behavior. The image-burst knob is documented but defaults to 0 so
 * existing tests don't regress — set perKind["generate.image"].minIntervalMs
 * in config to opt into throttling.
 */
export const DEFAULT_PER_KIND: Partial<Record<JobKind, KindScheduleConfig>> = {};

/**
 * Can a job of `kind` be dispatched right now? Pure decision:
 *  - under the per-kind concurrency cap (default = global), AND
 *  - at least `minIntervalMs` has elapsed since this kind last dispatched.
 *
 * @param runningByKind   live count of running jobs per kind
 * @param lastDispatchByKind  ms-epoch of the last dispatch per kind (absent = never)
 * @param now             ms epoch (injected so tests are deterministic)
 */
export function canDispatch(
  kind: JobKind,
  runningByKind: Partial<Record<JobKind, number>>,
  lastDispatchByKind: Partial<Record<JobKind, number>>,
  now: number,
  config: ScheduleConfig,
): boolean {
  const knobs = config.perKind?.[kind] ?? DEFAULT_PER_KIND[kind] ?? {};
  const cap = knobs.maxConcurrent ?? config.globalConcurrency;
  const minInterval = knobs.minIntervalMs ?? 0;

  if ((runningByKind[kind] ?? 0) >= cap) return false;

  const last = lastDispatchByKind[kind];
  if (last !== undefined && minInterval > 0 && now - last < minInterval) return false;

  return true;
}

/**
 * The set of kinds that may claim a slot this tick. The worker computes this
 * once per tick, then claims only within it. With default config this returns
 * all `candidateKinds` unchanged (zero behavior change).
 */
export function dispatchableKinds(
  candidateKinds: JobKind[],
  runningByKind: Partial<Record<JobKind, number>>,
  lastDispatchByKind: Partial<Record<JobKind, number>>,
  now: number,
  config: ScheduleConfig,
): JobKind[] {
  return candidateKinds.filter((k) =>
    canDispatch(k, runningByKind, lastDispatchByKind, now, config),
  );
}
