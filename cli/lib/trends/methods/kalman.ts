// Method on trial (#578): Kalman-filtered creator baseline versus the #556
// rolling median. Behind the backtest `--methods kalman` flag only.
//
// Local-level model on a creator's log views in posting order:
//
//   x_j = level_j + eps_j,      eps ~ N(0, r)   (video-to-video noise)
//   level_j = level_{j-1} + eta_j,  eta ~ N(0, q)   (slow drift of the creator)
//
// The one-step-ahead predicted level (before video j is seen) is the
// creator's baseline for video j. A Huber clip on the standardized
// innovation stops a single breakout from dragging the level (robust mode).

export interface LocalLevelParams {
  q: number;
  r: number;
  /** Clip |innovation| / sqrt(S) at this value when updating (robust). */
  huber?: number | null;
}

export interface LocalLevelRun {
  /** Predicted level before each observation (index 0: null, no prior). */
  predicted: Array<number | null>;
  predictedVar: Array<number | null>;
  filtered: number[];
  logLik: number;
}

export function localLevel(observations: readonly number[], params: LocalLevelParams): LocalLevelRun {
  const predicted: Array<number | null> = [];
  const predictedVar: Array<number | null> = [];
  const filtered: number[] = [];
  let logLik = 0;
  let m = 0;
  let p = 0;
  for (let j = 0; j < observations.length; j += 1) {
    const y = observations[j]!;
    if (j === 0) {
      predicted.push(null);
      predictedVar.push(null);
      m = y;
      p = params.r;
      filtered.push(m);
      continue;
    }
    const mPrior = m;
    const pPrior = p + params.q;
    predicted.push(mPrior);
    predictedVar.push(pPrior + params.r);
    const s = pPrior + params.r;
    let innovation = y - mPrior;
    logLik += -0.5 * (Math.log(2 * Math.PI * s) + (innovation * innovation) / s);
    if (params.huber && params.huber > 0) {
      const limit = params.huber * Math.sqrt(s);
      if (innovation > limit) innovation = limit;
      else if (innovation < -limit) innovation = -limit;
    }
    const gain = pPrior / s;
    m = mPrior + gain * innovation;
    p = (1 - gain) * pPrior;
    filtered.push(m);
  }
  return { predicted, predictedVar, filtered, logLik };
}

const logGrid = (low: number, high: number, steps: number): number[] =>
  Array.from({ length: steps }, (_, index) => Math.exp(Math.log(low) + ((Math.log(high) - Math.log(low)) * index) / (steps - 1)));

/** Maximum-likelihood (q, r) over a log grid, pooled across creators. */
export function fitLocalLevel(series: ReadonlyArray<readonly number[]>, options: { qRange?: [number, number]; rRange?: [number, number]; steps?: number } = {}): LocalLevelParams & { logLik: number; observations: number } {
  const steps = options.steps ?? 25;
  const qs = logGrid(options.qRange?.[0] ?? 1e-4, options.qRange?.[1] ?? 1, steps);
  const rs = logGrid(options.rRange?.[0] ?? 0.01, options.rRange?.[1] ?? 9, steps);
  const usable = series.filter((list) => list.length >= 3);
  const observations = usable.reduce((sum, list) => sum + list.length, 0);
  let best = { q: qs[0]!, r: rs[0]!, logLik: -Infinity };
  for (const q of qs) {
    for (const r of rs) {
      let total = 0;
      for (const list of usable) total += localLevel(list, { q, r }).logLik;
      if (total > best.logLik) best = { q, r, logLik: total };
    }
  }
  return { ...best, observations };
}

/** One-step-ahead rolling-median baseline (the #556 window, K most recent). */
export function rollingMedianPredictions(observations: readonly number[], k = 30): Array<number | null> {
  return observations.map((_, j) => {
    if (j === 0) return null;
    const window = observations.slice(Math.max(0, j - k), j).slice().sort((a, b) => a - b);
    const middle = Math.floor(window.length / 2);
    return window.length % 2 === 1 ? window[middle]! : (window[middle - 1]! + window[middle]!) / 2;
  });
}
