# Publishing platform quota governor

> **Status:** done — 2026-07-08
> **Filed:** 2026-07-07
> **Folder:** issues
> **Severity:** medium
> **Category:** publishing / operations / scale

## Context

#522 governs GENERATION provider concurrency (OpenRouter/fal/ElevenLabs). It
does NOT model PUBLISHING platform limits, which are a different resource:
YouTube Data API has a daily quota where an upload costs ~1600 units of a
default 10k/day budget (≈6 uploads/day without a raise); X has per-window post
caps; dev.to/Hashnode have rate limits. A campaign that plans 30 YouTube
videos (#528) can silently exhaust the day-1 quota and fail the rest.

## What

A per-platform publish-quota model consulted by the scheduler before assigning
a publish to a slot: declared limits per target (daily/window caps, API-unit
costs where relevant), a rolling usage counter per workspace+platform, and
over-quota handling that pushes the publish to the next valid window (composes
with cadence #525) rather than failing. Quota headroom is surfaced in preflight
(#530) and cost/plan forecasts (#516).

## Why it matters

At 30/30/30 volume, platform quotas — not generation cost — become the binding
constraint on YouTube specifically. Modeling them turns a mid-campaign wall of
opaque publish failures into a smooth, quota-aware posting schedule.

## Scope / acceptance

- Quota schema per target (daily cap / window cap / per-action API-unit cost /
  reset boundary), seeded with documented current values + a `source` +
  `verified-on` date (these change — treat as data, flag staleness).
- Rolling usage ledger per workspace+platform; the scheduler checks headroom
  before committing a slot; over-quota = reschedule to next window (never
  drop, never hard-fail).
- Preflight (#530) reports quota headroom vs the calendar's planned volume;
  simulate (#516) includes a quota-feasibility line ("plan needs 30 YT
  uploads / 6-per-day quota = 5 days minimum").
- 429/quota-exceeded platform responses classify as `transient` (#519) and
  back off against the ledger.
- Config for users who raised their platform quota (override the default cap).
- Tests: headroom math, reschedule-on-exhaustion, multi-day drain of a
  30-item plan, quota override, staleness flag.

## Notes

- Sequence after #501/#522/#525.
- Deliberately data-driven + dated: platform quotas drift; the code must not
  bake them as constants.
