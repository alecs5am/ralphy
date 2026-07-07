// Humanized posting-cadence config schema (#525) — the per-workspace `cadence`
// block on workspace.json (mirrors the `notifications` block, #518, and the
// `trust` block). It sits BETWEEN calendar-slot resolution and the publish
// node's `schedule_at`: an exact recurring slot (or a fixed webhook delay)
// becomes a SAMPLED time inside a fuzzy window so a channel does not post at
// 09:00:00 sharp every weekday (which reads as a bot to feeds and audiences).
//
// PRESENCE gates the whole layer. An absent `cadence` block reads back
// `enabled: false` → sampling is a NO-OP and the calendar-slot executor emits
// the exact slot time exactly as it did pre-#525 (so every existing calendar
// test keeps passing untouched). Once an operator adds a `cadence` block (or a
// bundle ships one), `enabled` defaults TRUE and sampling turns on — the
// issue's "defaults ON when a calendar exists" satisfied without a silent
// behavior change on workspaces that never opted in.
//
// Malformed values degrade to safe defaults (`.catch`) so a hand-edited
// workspace.json never crashes the farm.

import { z } from "zod";
import { PLATFORMS } from "./calendar.js";

/** HH:MM (24h) — the window edges are wall-clock local to the slot's timezone. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * How a jitter window is sampled:
 *  • uniform      — flat across [start, end].
 *  • mid-weighted — a triangular pull toward the middle (average of two draws),
 *    the "a human aims for mid-window but drifts" shape.
 */
export const JITTER_DISTRIBUTIONS = ["uniform", "mid-weighted"] as const;
export type JitterDistribution = (typeof JITTER_DISTRIBUTIONS)[number];

/**
 * A named jitter window keyed by the slot's local time. When a slot's exact
 * time falls inside `[start, end]`, the post is re-sampled within that window;
 * otherwise the whole window replaces the slot time (a slot at 09:00 with a
 * "morning" window 08:40-10:15 samples inside 08:40-10:15).
 */
export const JitterWindowSchema = z.object({
  /** Window start, local HH:MM. */
  start: z.string().regex(TIME_RE, { message: "start must be HH:MM (24h)" }),
  /** Window end, local HH:MM (must be after start on the same day). */
  end: z.string().regex(TIME_RE, { message: "end must be HH:MM (24h)" }),
  /** Sampling shape inside the window. Default the profile's distribution. */
  distribution: z.enum(JITTER_DISTRIBUTIONS).optional(),
});
export type JitterWindow = z.infer<typeof JitterWindowSchema>;

/**
 * A per-platform posting profile. `windows` are matched by whether the slot's
 * local time falls inside one; the FIRST matching window is used, else the
 * nearest (by start) window applies its span around the slot. `weekdayShift`
 * nudges the window by ±N minutes per weekday (mon..sun) — a channel that
 * posts slightly later on weekends reads as human.
 */
export const CadenceProfileSchema = z.object({
  /** Default sampling shape for windows that do not set their own. */
  distribution: z.enum(JITTER_DISTRIBUTIONS).catch("mid-weighted").default("mid-weighted"),
  /** Named jitter windows (order matters — first containing/nearest wins). */
  windows: z.array(JitterWindowSchema).catch([]).default([]),
  /**
   * Minutes to shift the sampled time per weekday. Keys are mon..sun; a
   * missing key = 0. Positive = later. Applied AFTER window sampling, then
   * re-clamped into the day. Small values (±30) keep it human, not chaotic.
   */
  weekdayShiftMin: z.record(z.string(), z.number()).catch({}).default({}),
  /**
   * Minimum minutes between two consecutive posts on the SAME platform. On a
   * conflict the sampler pushes the later post forward to the next valid
   * instant (min-gap after the neighbor). Default 0 = no gap enforced.
   */
  minGapMinutes: z.number().min(0).catch(0).default(0),
  /**
   * Probability [0,1] a post SLIDES to the next window instead of staying in
   * its own — an occasional "I posted this a bit later than usual" beat.
   * Default 0 = never slide.
   */
  slideProbability: z.number().min(0).max(1).catch(0).default(0),
});
export type CadenceProfile = z.infer<typeof CadenceProfileSchema>;

/**
 * The default profile applied when cadence is enabled but a platform has no
 * explicit profile: a tight ±7-minute-ish morning-ish spread that is ON but
 * conservative. Sane-default: turns robotic exactness into human fuzz without
 * an operator authoring windows.
 */
export const DEFAULT_CADENCE_PROFILE: CadenceProfile = CadenceProfileSchema.parse({
  distribution: "mid-weighted",
  windows: [],
  minGapMinutes: 30,
  slideProbability: 0.08,
});

export const CadenceConfigSchema = z.object({
  /**
   * Master switch. Absent block → false (NO-OP, exact times). Present block →
   * true unless explicitly disabled. The presence-gates-default rule.
   */
  enabled: z.boolean().catch(true).default(true),
  /**
   * Default jitter span (± minutes) applied around a slot time when no window
   * matches AND the platform profile lists no windows. Keeps "cadence on with
   * zero authored windows" meaningful. Default ±10 minutes.
   */
  defaultJitterMinutes: z.number().min(0).catch(10).default(10),
  /** Default sampling shape when a profile does not set one. */
  distribution: z.enum(JITTER_DISTRIBUTIONS).catch("mid-weighted").default("mid-weighted"),
  /** Per-platform profiles; a platform with no entry uses the derived default. */
  platforms: z
    .record(z.enum(PLATFORMS), CadenceProfileSchema)
    .catch({})
    .default({}),
});
export type CadenceConfig = z.infer<typeof CadenceConfigSchema>;

/** Parse the `cadence` block (defaults + `.catch` = never throws in the farm). */
export function parseCadenceConfig(raw: unknown): CadenceConfig {
  return CadenceConfigSchema.parse(raw ?? {});
}

/** The disabled config an absent `cadence` block reads back as (the NO-OP). */
export const DISABLED_CADENCE_CONFIG: CadenceConfig = CadenceConfigSchema.parse({ enabled: false });
