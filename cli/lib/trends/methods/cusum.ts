// Method on trial (#578): CUSUM change-point (regime) detector. Behind the
// backtest `--methods cusum` flag only; no default path uses it.
//
// Two-sided tabular CUSUM on a standardized series:
//
//   S+_t = max(0, S+_{t-1} + z_t - k),   S-_t = max(0, S-_{t-1} - z_t - k)
//
// An alarm fires when either side exceeds h. The change point is the step
// after the alarming side last sat at zero. After an alarm the reference
// mean moves to the new regime (mean of the points since the change, refined
// over a burn-in of `warmup` points before the detector re-arms) and both
// sides reset, so a series can carry several regimes. Used on a
// creator's log views it gives a regime-aware baseline: only videos since
// the last change point count.

export interface CusumOptions {
  /** Allowance in sd units (half the shift worth detecting). */
  k?: number;
  /** Decision threshold in sd units. */
  h?: number;
  /** Reference mean; default: median of the first `warmup` points. */
  mean?: number;
  /** Reference sd; default: 1.4826 * MAD of the first `warmup` points (floor 0.05). */
  sd?: number;
  warmup?: number;
}

export interface CusumChange {
  /** Index of the first point of the new regime (estimate). */
  changeAt: number;
  /** Index where the alarm fired. */
  alarmAt: number;
  direction: "up" | "down";
  /** New reference mean after the change. */
  newMean: number;
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

export function cusum(series: readonly number[], options: CusumOptions = {}): { changes: CusumChange[]; mean: number; sd: number } {
  const k = options.k ?? 0.5;
  const h = options.h ?? 5;
  const warmup = Math.min(series.length, options.warmup ?? 10);
  if (series.length === 0) return { changes: [], mean: options.mean ?? 0, sd: options.sd ?? 1 };
  const head = series.slice(0, Math.max(1, warmup));
  let reference = options.mean ?? median(head);
  const sd = options.sd ?? Math.max(1.4826 * median(head.map((value) => Math.abs(value - median(head)))), 0.05);
  const changes: CusumChange[] = [];
  let up = 0;
  let down = 0;
  let upZeroAt = -1;
  let downZeroAt = -1;
  let regimeStart = 0;
  let burnInUntil = -1;
  for (let t = 0; t < series.length; t += 1) {
    const z = (series[t]! - reference) / sd;
    up = Math.max(0, up + z - k);
    down = Math.max(0, down - z - k);
    if (up === 0) upZeroAt = t;
    if (down === 0) downZeroAt = t;
    if (t < burnInUntil) {
      // Refine the new regime's mean before arming again (stops cascades
      // from a mean estimated on a handful of points).
      const segment = series.slice(regimeStart, t + 1);
      reference = segment.reduce((sum, value) => sum + value, 0) / segment.length;
      up = 0;
      down = 0;
      upZeroAt = t;
      downZeroAt = t;
      continue;
    }
    if (up > h || down > h) {
      const direction = up > h ? "up" : "down";
      const changeAt = Math.max(regimeStart, (direction === "up" ? upZeroAt : downZeroAt) + 1);
      const segment = series.slice(changeAt, t + 1);
      reference = segment.reduce((sum, value) => sum + value, 0) / segment.length;
      changes.push({ changeAt, alarmAt: t, direction, newMean: reference });
      up = 0;
      down = 0;
      upZeroAt = t;
      downZeroAt = t;
      regimeStart = changeAt;
      burnInUntil = t + 1 + Math.max(0, warmup - segment.length);
      changes[changes.length - 1]!.newMean = reference;
    }
  }
  return { changes, mean: reference, sd };
}

/** Index of the first point of the current regime (0 when no change fired). */
export function currentRegimeStart(series: readonly number[], options: CusumOptions = {}): number {
  const { changes } = cusum(series, options);
  return changes.length === 0 ? 0 : changes[changes.length - 1]!.changeAt;
}
