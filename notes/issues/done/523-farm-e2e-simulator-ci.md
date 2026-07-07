# Farm end-to-end simulator in CI

> **Status:** done — 2026-07-08
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** high
> **Category:** testing / ci / content-farm

## Context

Each farm piece landed with unit tests, but nothing exercises the whole
production loop as one system: bundle -> import -> tick -> ingest -> produce
-> gate -> park -> approve -> publish -> analytics -> report. The #509 pilot
covers it with real money and an owner in the loop — CI needs the same story
with neither. The agent-simulator (#431) is the worked pattern: deterministic
fixtures driving the real code paths with mocked spend.

## What

A farm simulator test suite: a committed fixture bundle (tiny graph with
trend-watch, one LLM node, one mocked media node, gate, approval, calendar,
publish), a scripted scenario runner that imports it into a temp `.ralphy`
root, fires ticks through the REAL runner with mocked provider executors
(via the `executorOverrides` seam), drives approvals programmatically, and
asserts the full journal/state trajectory — including the ugly paths: budget
halt mid-tick, filter reroute (#514), quarantine + targeted retry (#519),
resume after a simulated crash, upgrade mid-lifecycle (#521).

## Why it matters

The farm is a long-running stateful system built by short-lived agent
sessions — exactly the combination where integration seams rot silently. One
CI-gated end-to-end scenario is worth fifty more unit tests: it is the
executable definition of "the farm works."

## Scope / acceptance

- `tests/integration/farm-e2e.test.ts` + fixture bundle under
  `tests/fixtures/farm/`; runs in CI on every push (respect suite timeout —
  target < 60s by keeping ticks synthetic).
- Golden-path scenario: import -> 2 ticks -> units gated -> L0 park ->
  approve -> publish (mock) -> analytics snapshot (mock) -> `farm report`
  numbers match expectations exactly.
- Failure scenarios: budget-guard halt, reroute-on-filter, quarantine +
  `farm retry`, kill-and-resume mid-tick (re-run the runner over the same
  journal), each asserting journal event sequences.
- Zero network: every provider/publish/analytics call mocked at the executor
  or connector seam; test fails if any real host is attempted (assert via a
  fetch guard).
- Scenario assertions read ONLY public surfaces (CLI verbs / app API /
  journal files) — no reaching into internals, so refactors stay honest.
- Wire into `.github/workflows/test.yml` if the integration suite isn't
  already covering it; while here, close the #494 gap if trivially adjacent
  (studio tests in CI) or leave #494 untouched — note the call either way.

## Notes

- Sequence after #511 (needs the production middle); extend scenarios as
  #513/#514/#519/#521 land — each of those issues should ADD a scenario here
  (note this in their execution).
