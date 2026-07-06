// Minimal 5-field cron parser for the farm scheduler (#503). No new deps.
//
// Supported syntax (standard cron, numeric only — no month/day names, no
// @hourly macros, no seconds field):
//
//   ┌───────────── minute        0-59
//   │ ┌─────────── hour          0-23
//   │ │ ┌───────── day of month  1-31
//   │ │ │ ┌─────── month         1-12
//   │ │ │ │ ┌───── day of week   0-7 (0 and 7 = Sunday)
//   │ │ │ │ │
//   * * * * *
//
// Each field accepts: `*`, a number, a range `a-b`, a step `*/n` or `a-b/n`,
// and comma lists of any of those (`0,30`, `9-12,14-17`). Standard semantics
// for the day fields: when BOTH day-of-month and day-of-week are restricted
// (not `*`), a date matches when EITHER matches; otherwise both must match.
//
// parseCron throws on malformed input (the workflow lint surfaces it before
// the farm ever sleeps on it); nextFire is pure over an injected `from` date
// so the scheduler and its tests share one clock seam.

export interface CronSpec {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  /** Whether the day-of-month / day-of-week field was written as `*`. */
  domIsStar: boolean;
  dowIsStar: boolean;
  /** The original expression, for events / errors. */
  expr: string;
}

const FIELD_RANGES: Array<{ name: string; min: number; max: number }> = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 7 },
];

function parseField(raw: string, min: number, max: number, name: string, expr: string): Set<number> {
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) {
      throw new Error(`cron "${expr}": ${name} field part "${part}" is not *, n, a-b, or a step of those`);
    }
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) throw new Error(`cron "${expr}": ${name} step must be >= 1`);
    let lo: number;
    let hi: number;
    if (m[1] === "*") {
      lo = min;
      hi = max;
    } else if (m[1]!.includes("-")) {
      const [a, b] = m[1]!.split("-").map(Number);
      lo = a!;
      hi = b!;
    } else {
      lo = hi = Number(m[1]);
      if (m[2]) hi = max; // `n/step` = "starting at n, every step" (vixie-cron)
    }
    if (lo < min || hi > max || lo > hi) {
      throw new Error(`cron "${expr}": ${name} value out of range ${min}-${max} in "${part}"`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Parse a 5-field cron expression. Throws on malformed input. */
export function parseCron(expr: string): CronSpec {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`cron "${expr}": expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`);
  }
  const sets = fields.map((f, i) => {
    const r = FIELD_RANGES[i]!;
    return parseField(f, r.min, r.max, r.name, expr);
  });
  const dow = sets[4]!;
  if (dow.has(7)) dow.add(0); // 7 ≡ Sunday
  return {
    minute: sets[0]!,
    hour: sets[1]!,
    dom: sets[2]!,
    month: sets[3]!,
    dow,
    domIsStar: fields[2] === "*",
    dowIsStar: fields[4] === "*",
    expr,
  };
}

/** Does the given local date-time (minute resolution) match the spec? */
export function cronMatches(spec: CronSpec, d: Date): boolean {
  if (!spec.minute.has(d.getMinutes())) return false;
  if (!spec.hour.has(d.getHours())) return false;
  if (!spec.month.has(d.getMonth() + 1)) return false;
  const domMatch = spec.dom.has(d.getDate());
  const dowMatch = spec.dow.has(d.getDay());
  // Standard cron day semantics: both restricted → OR, else AND (a `*` side
  // always matches, so AND degenerates to the restricted side).
  if (!spec.domIsStar && !spec.dowIsStar) return domMatch || dowMatch;
  return domMatch && dowMatch;
}

/**
 * The next fire time STRICTLY AFTER `from`, at minute resolution (local time).
 * Returns null when nothing matches within ~366 days (an impossible spec like
 * `0 0 31 2 *`). ponytail: minute-walk, not field arithmetic — worst case
 * ~527k cheap iterations, and it is trivially correct on every edge case.
 */
export function nextFire(spec: CronSpec, from: Date): Date | null {
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (cronMatches(spec, d)) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}
