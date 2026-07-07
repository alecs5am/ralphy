# Humanized posting cadence

> **Status:** done — 2026-07-08
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** medium
> **Category:** publishing / scheduling / content-farm

## Context

Scheduling is currently exact: calendar slots resolve to precise timestamps
(#504) and webhook-triggered ticks (#520) would publish a fixed delay after
the event. A channel that posts at 09:00:00 sharp every weekday — or exactly
20 minutes after every source story — reads as a bot to both audiences and
platform heuristics. A human posts inside fuzzy windows, varies by weekday,
occasionally skips or slides a slot.

## What

A cadence layer between slot resolution and `schedule_at`: per-workspace (and
per-platform) posting profiles that turn an exact slot into a sampled time —
jitter window per slot (e.g. "morning slot = 08:40-10:15, weighted
mid-window"), weekday variance, minimum gap between consecutive posts on the
same platform, occasional slot slide (small probability of moving a post to
the next window), and a per-run seed journaled so a schedule is reproducible
after resume.

## Why it matters

The goal of the farm is content that earns on its merits; a robotic cadence
undermines that regardless of content quality. Natural timing is also simply
better distribution — humans and feeds both respond to it.

## Scope / acceptance

- `cadence` block in workspace config + bundle defaults (#502): per-platform
  windows, jitter distribution (uniform | mid-weighted), min-gap, slide
  probability; sane defaults ON when a calendar exists.
- `calendar-slot` executor (#504) resolves slot -> sampled `schedule_at`;
  the sample is journaled (seeded PRNG keyed by run id — deterministic on
  resume, different across runs).
- Event-triggered publishes (#520 path) get a sampled delay window instead of
  a fixed offset (param: `delay_window: [min, max]`).
- Min-gap enforced across the workspace's pending scheduled posts per
  platform (query Postiz-scheduled + local pending; on conflict, push to the
  next valid sample).
- `workflow simulate` (#516) and the calendar view (#506) show the sampled
  times, marked as sampled.
- Tests: window sampling bounds, weekday profiles, min-gap conflict
  resolution, resume determinism, fixed-offset fallback when cadence is
  disabled.

## Notes

- Sequence after #504; touches #501 (schedule_at passthrough) and #520.
- Scope is timing only — copy/structure variance is #529.
