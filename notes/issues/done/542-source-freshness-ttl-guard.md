# Source freshness TTL and staleness guard

> **Status:** done — 2026-07-09 (freshness.ts pure layer: resolveFreshnessTtl item→node→content-class→evergreen-optout; classifyFreshness age-from-source-ts fail-open on unparseable; orderByFreshness within-priority-band composing with cadence/quota/trust not overriding. publishExecutor guard BEFORE trust/paid publish: drop (stale-dropped journal event) or downgrade. farm report staleDropped count. #541 seam noted: stale-drop != covered.)
> **Filed:** 2026-07-08
> **Folder:** issues
> **Severity:** medium
> **Category:** ingestion / scheduling / content-farm

## Context

A news item has a shelf life. The pipeline can queue a source item, and by the
time cadence (#525), quota pacing (#534), and an approval park (#533) release
the resulting unit, the story may be days old. `source-item` carries a `ts`
(#500) but nothing enforces a maximum age between INGESTION and PUBLISH — a
backed-up farm will happily post "breaking" news that broke last week.

## What

A freshness TTL on time-sensitive content: source items carry (or inherit from
the node) a `freshness_ttl`; the runner drops or deprioritizes a unit whose
source has aged past the TTL before it publishes, and the scheduler prioritizes
fresher items when a backlog forms (freshness-weighted queue ordering, not
strict FIFO). Evergreen content opts out (TTL = none).

## Why it matters

Stale news is worse than no news — it signals an unattended bot and misleads
the audience. TTL + freshness-weighted ordering keeps a high-frequency farm
timely under backlog, which is exactly when it matters.

## Scope / acceptance

- `freshness_ttl` on the source-item schema (#500) + a node-level default
  (per content type: news short = hours/short, evergreen article = none);
  bundled defaults (#502).
- Age computed from source `ts` (publish-time of the story), not ingestion
  time, so a late-ingested-but-old story is correctly stale.
- Guard at publish time: past-TTL unit is dropped with a journal event
  (`stale-dropped`, carrying age + TTL) or, if configured, downgraded to a
  lower-priority evergreen treatment; never silently published as fresh.
- Scheduler: when queued units exceed slot capacity, order by freshness within
  priority (a fresher story preempts an older queued one) — composes with
  cadence (#525) and quota (#534), does not override the trust gate.
- Surfaced in `farm report` (#518): stale-dropped count so the operator sees
  throughput loss (a signal the tick cadence or quota is too slow for the
  ingest rate).
- Tests: past-TTL drop, freshness-weighted reordering under backlog, evergreen
  opt-out, age-from-source-ts (not ingest-ts), report accounting.

## Notes

- Sequence after #500/#525/#534.
- Interacts with topic dedup (#541): a dropped-stale item must not be treated
  as "covered" — it was never published, so the topic stays open for a fresher
  source.
