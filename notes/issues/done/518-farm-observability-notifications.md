# Farm observability and operator notifications

> **Status:** done — 2026-07-08
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** high
> **Category:** operations / studio / content-farm

## Context

The run journal (#503) records events, and the dashboard (#506) shows live
runs — but there is no aggregate view over time (cost per unit trend, node
failure rates, cache hit rates, tick durations) and no push channel at all:
an L0 farm that parks a run for approval at 2am waits silently until the user
happens to open the dashboard. The trust ladder's whole premise is "the user
steps away" — something has to tap their shoulder.

## What

Two pieces:

1. **Metrics rollup** — derive per-workspace operational metrics from run
   journals: ticks, units produced/gated/published, spend per unit and per
   tick, node failure/reroute/cache rates, median node durations, approval
   latency. `ralphy farm report <ws> [--since]` + a dashboard panel via the
   app API.
2. **Notifications** — a pluggable notifier (webhook generic + Telegram as
   the first concrete channel) fired on: run parked for approval, budget-guard
   halt, run failed, trust-ladder promotion suggestion, and a daily digest
   (produced/published/spend/needs-you). Config per workspace; quiet by
   default.

## Why it matters

Observability is what makes L1/L2 trustable (the user can SEE the farm is
sane without babysitting it), and notifications are what make L0 livable
(approval latency is the farm's throughput ceiling when a human is the gate).

## Scope / acceptance

- Rollup computed from journals on demand (no new write path, no metrics DB);
  degrades gracefully on partial journals.
- Notifier interface + webhook and Telegram implementations under the
  connector discipline (bot token via env var, no other hosts); failures to
  notify never fail the run (log and continue).
- Event -> notification mapping configurable per workspace
  (`notifications` block in workspace config; bundled defaults in #502).
- Daily digest content mirrors `farm report` summary; approval notifications
  deep-link to the dashboard inbox item.
- `ralphy farm report` honors the out() render contract; endpoint added to
  the app API (#492 boundary).
- Tests: rollup math on fixture journals, mapping config, notifier mock
  (fired events, payload shape, failure isolation), digest assembly.

## Notes

- Sequence after #503; digest wants #513 (cache) + #514 (reroutes) landed to
  report them, but degrade gracefully when absent.
- Email channel deliberately out of scope v1 (SMTP config burden); note it.
