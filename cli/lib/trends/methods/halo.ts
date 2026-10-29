// Method on trial (#578): post-hit halo correction. Behind the backtest
// `--methods halo` flag only; no default path uses it.
//
// After a breakout a creator's next videos ride the follower influx: their
// log views sit above the pre-hit baseline by a halo that decays with time
// since the hit,
//
//   excess(delta) = h0 * exp(-delta / tau).
//
// `estimateHalo` fits (h0, tau) from (delta, excess) pairs: for every hit,
// the excess of each later non-hit video within the window over the median
// of the K videos before the hit (most recent hit only). Grid search on tau,
// closed-form least squares for h0. `haloCorrection` is what to subtract
// from a post-hit video before it enters a baseline or gets scored.

export interface HaloVideo {
  postedAt: number;
  /** Log value (e.g. ln(1 + views at a fixed age)). */
  x: number;
  hit: boolean;
}

export interface HaloFit {
  h0: number;
  tauDays: number;
  n: number;
  sse: number;
}

const DAY = 86_400_000;

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** (delta days, excess) pairs for one creator's videos (any order). */
export function haloPairs(videos: readonly HaloVideo[], options: { windowDays?: number; baselineK?: number; minBaseline?: number } = {}): Array<{ deltaDays: number; excess: number }> {
  const windowDays = options.windowDays ?? 30;
  const k = options.baselineK ?? 15;
  const minBaseline = options.minBaseline ?? 5;
  const sorted = [...videos].sort((a, b) => a.postedAt - b.postedAt);
  const pairs: Array<{ deltaDays: number; excess: number }> = [];
  let lastHit: { at: number; baseline: number } | null = null;
  for (let j = 0; j < sorted.length; j += 1) {
    const video = sorted[j]!;
    if (video.hit) {
      const before = sorted.slice(0, j).filter((other) => !other.hit).slice(-k).map((other) => other.x);
      const baseline = before.length >= minBaseline ? median(before) : null;
      lastHit = baseline === null ? null : { at: video.postedAt, baseline };
      continue;
    }
    if (!lastHit) continue;
    const deltaDays = (video.postedAt - lastHit.at) / DAY;
    if (deltaDays > 0 && deltaDays <= windowDays) pairs.push({ deltaDays, excess: video.x - lastHit.baseline });
  }
  return pairs;
}

export function estimateHalo(creators: ReadonlyArray<readonly HaloVideo[]>, options: { windowDays?: number; baselineK?: number; minBaseline?: number; minPairs?: number } = {}): HaloFit | null {
  const pairs = creators.flatMap((videos) => haloPairs(videos, options));
  if (pairs.length < (options.minPairs ?? 20)) return null;
  let best: HaloFit | null = null;
  for (let tau = 0.5; tau <= 60; tau += 0.25) {
    let sff = 0;
    let sef = 0;
    for (const pair of pairs) {
      const f = Math.exp(-pair.deltaDays / tau);
      sff += f * f;
      sef += pair.excess * f;
    }
    if (sff <= 0) continue;
    const h0 = sef / sff;
    let sse = 0;
    for (const pair of pairs) {
      const residual = pair.excess - h0 * Math.exp(-pair.deltaDays / tau);
      sse += residual * residual;
    }
    if (!best || sse < best.sse) best = { h0, tauDays: tau, n: pairs.length, sse };
  }
  return best;
}

/** Expected halo for a video posted `deltaDays` after the creator's last hit. */
export function haloCorrection(fit: Pick<HaloFit, "h0" | "tauDays">, deltaDays: number | null): number {
  if (deltaDays === null || !(deltaDays > 0)) return 0;
  return fit.h0 * Math.exp(-deltaDays / fit.tauDays);
}
