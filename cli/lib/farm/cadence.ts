// Humanized posting-cadence sampler (#525) — the pure function BETWEEN
// calendar-slot resolution and the publish node's `schedule_at`. Turns an
// exact slot instant (or a fixed webhook delay) into a SAMPLED instant inside
// a fuzzy window, weekday-shifted, occasionally slid, and min-gap-separated
// from the same platform's neighbours.
//
// DETERMINISM: every random draw comes from a seeded PRNG (cli/lib/farm/prng.ts)
// keyed by the run id — NEVER Math.random()/Date.now(). Same seed → same
// sampled time, so a resume re-derives the identical schedule; different run
// ids diverge statistically. The sampler is a pure function of
// (exact time, config, platform, seed, neighbours) — no I/O, trivially tested.
//
// The math runs in the slot's LOCAL wall-clock (minutes-of-day) so a window
// like 08:40-10:15 means the same local hours regardless of DST, then converts
// back to a UTC instant via the calendar store's tz helpers.

import { localParts, zonedTimeToUtc } from "../calendar/store.js";
import { WEEKDAYS, type Weekday, type Platform } from "../schemas/calendar.js";
import {
  DEFAULT_CADENCE_PROFILE,
  type CadenceConfig,
  type CadenceProfile,
  type JitterDistribution,
} from "../schemas/cadence.js";
import { makePrng, type Prng } from "./prng.js";

const DAY_MIN = 24 * 60;

/** "HH:MM" → minutes-of-day. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Draw a value in [lo, hi) with the profile's distribution shape. */
function drawInWindow(prng: Prng, lo: number, hi: number, dist: JitterDistribution): number {
  if (hi <= lo) return lo;
  if (dist === "mid-weighted") {
    // Average of two uniform draws = a triangular pull toward the middle.
    return lo + ((prng.next() + prng.next()) / 2) * (hi - lo);
  }
  return prng.float(lo, hi);
}

export interface CadenceSampleInput {
  /** The exact slot instant to humanize (ISO 8601). */
  exactIso: string;
  /** The slot's IANA timezone — windows are local wall-clock in this zone. */
  timezone: string;
  /** Target platform selecting the profile (undefined → the derived default). */
  platform?: Platform | string;
  /** The resolved workspace cadence config. */
  config: CadenceConfig;
  /** Seed source — the run id (folded into the PRNG); a per-slot salt is added. */
  seed: string;
  /**
   * Already-scheduled instants (ISO) on the SAME platform — Postiz + local
   * pending. The sampler keeps min-gap from every one of them.
   */
  neighbours?: string[];
}

export interface CadenceSample {
  /** The humanized instant (ISO 8601). */
  scheduleAt: string;
  /** True when sampling actually moved the time (false = cadence disabled/no-op). */
  sampled: boolean;
  /** How the time was reached, for the studio/simulate "marked as sampled" surface. */
  basis: "disabled" | "window" | "default-jitter" | "slid" | "gap-pushed";
  /** Minutes moved from the exact slot time (signed). */
  offsetMinutes: number;
}

/** The profile for a platform — explicit entry, else the derived default. */
function profileFor(config: CadenceConfig, platform: string | undefined): CadenceProfile {
  const explicit = platform ? config.platforms[platform as Platform] : undefined;
  if (explicit) return explicit;
  // Derived default: the shared shape with the config-level distribution +
  // the config default jitter expressed as a single window around any slot.
  return { ...DEFAULT_CADENCE_PROFILE, distribution: config.distribution };
}

/**
 * Pick the window whose [start,end] contains `slotMin`, else the nearest by
 * start. Returns null when the profile lists no windows (→ default jitter).
 */
function pickWindow(
  profile: CadenceProfile,
  slotMin: number,
  slide: boolean,
): { start: number; end: number; distribution?: JitterDistribution } | null {
  if (profile.windows.length === 0) return null;
  const parsed = profile.windows.map((w) => ({
    start: toMinutes(w.start),
    end: toMinutes(w.end),
    distribution: w.distribution,
  }));
  const containingIdx = parsed.findIndex((w) => slotMin >= w.start && slotMin <= w.end);
  const baseIdx =
    containingIdx >= 0
      ? containingIdx
      : parsed.reduce(
          (best, w, i) =>
            Math.abs(w.start - slotMin) < Math.abs(parsed[best]!.start - slotMin) ? i : best,
          0,
        );
  // Slide → next window (wraps to the first), the "posted a bit later" beat.
  const idx = slide ? (baseIdx + 1) % parsed.length : baseIdx;
  return parsed[idx]!;
}

/** Minutes-of-day of an instant in a timezone. */
function slotMinutesOfDay(exactMs: number, tz: string): { min: number; weekday: Weekday; y: number; mo: number; d: number } {
  const p = localParts(exactMs, tz);
  return { min: p.h * 60 + p.mi, weekday: p.weekday, y: p.y, mo: p.mo, d: p.d };
}

/**
 * Sample a humanized instant for one slot. Pure + deterministic given the
 * seed. When cadence is disabled the exact time passes through unchanged
 * (basis "disabled") — the pre-#525 behaviour.
 */
export function sampleCadence(input: CadenceSampleInput): CadenceSample {
  const { exactIso, timezone, platform, config, seed } = input;
  const exactMs = Date.parse(exactIso);
  if (!config.enabled || !Number.isFinite(exactMs)) {
    return { scheduleAt: exactIso, sampled: false, basis: "disabled", offsetMinutes: 0 };
  }

  const profile = profileFor(config, platform);
  // Per-slot PRNG: run id + platform + the exact instant → a stable stream for
  // THIS slot in THIS run. Resume re-derives the same draws; a different run
  // id (or a different slot) diverges.
  const prng = makePrng(`${seed}|${platform ?? "any"}|${exactIso}`);

  const { min: slotMin, weekday, y, mo, d } = slotMinutesOfDay(exactMs, timezone);

  // Slide decision first (consumes one draw deterministically).
  const slide = prng.next() < profile.slideProbability;

  const window = pickWindow(profile, slotMin, slide);
  let sampledMin: number;
  let basis: CadenceSample["basis"];
  if (window) {
    const dist = window.distribution ?? profile.distribution;
    sampledMin = drawInWindow(prng, window.start, window.end, dist);
    basis = slide ? "slid" : "window";
  } else {
    // No windows: jitter ± defaultJitterMinutes around the slot time.
    const j = config.defaultJitterMinutes;
    sampledMin = drawInWindow(prng, slotMin - j, slotMin + j, profile.distribution);
    basis = "default-jitter";
  }

  // Weekday shift (applied after the window draw).
  const shift = profile.weekdayShiftMin[weekday] ?? 0;
  sampledMin += shift;
  // Round to a whole minute, THEN clamp into the day so the hour carry is
  // correct (rounding 59.6 → 60 must roll into the next hour, not zero the
  // minute of the same hour).
  const whole = Math.max(0, Math.min(DAY_MIN - 1, Math.round(sampledMin)));
  const h = Math.floor(whole / 60);
  const mi = whole % 60;
  let atMs = zonedTimeToUtc(y, mo, d, h, mi, timezone);

  // Min-gap against the same-platform neighbours (Postiz + local pending).
  const pushed = enforceMinGap(atMs, input.neighbours ?? [], profile.minGapMinutes);
  if (pushed.pushed) {
    atMs = pushed.at;
    basis = "gap-pushed";
  }

  const offsetMinutes = Math.round((atMs - exactMs) / 60000);
  return { scheduleAt: new Date(atMs).toISOString(), sampled: true, basis, offsetMinutes };
}

/**
 * Push `atMs` forward until it is at least `gapMinutes` from every neighbour.
 * Deterministic (no randomness): the conflict resolution is "next valid
 * instant after the blocking neighbour + gap", iterated until clear.
 */
export function enforceMinGap(
  atMs: number,
  neighbours: string[],
  gapMinutes: number,
): { at: number; pushed: boolean } {
  if (gapMinutes <= 0) return { at: atMs, pushed: false };
  const gapMs = gapMinutes * 60000;
  const times = neighbours
    .map((n) => Date.parse(n))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  let at = atMs;
  let pushed = false;
  // Iterate: a push can create a new conflict with a later neighbour.
  let moved = true;
  while (moved) {
    moved = false;
    for (const t of times) {
      if (Math.abs(at - t) < gapMs && at <= t + gapMs) {
        at = t + gapMs;
        pushed = true;
        moved = true;
      }
    }
  }
  return { at, pushed };
}

/** WEEKDAYS re-export so callers validate weekdayShift keys without a second import. */
export { WEEKDAYS };
