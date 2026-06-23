# Flaky test: ref-pull bulk idempotent network timeout

> **Status:** done — 2026-06-23
> **Filed:** 2026-06-16
> **Folder:** issues

## Context

Surfaced during the #430–#451 `/dev-loop` run: the pre-push full suite intermittently fails `tests/integration/cli-ref-pull-bulk.test.ts` → `ralphy ref pull --from-file --kind reference-image (#048) > idempotent: re-running on the same URL is a skipped-existing no-op`, with a **45004ms duration** (it hit the 45s test timeout). It passes 7/0 in isolation.

## What

The idempotency assertion appears to make a real network fetch to the source URL; under full-suite parallel load that fetch stalls past the 45s timeout. The "skipped-existing no-op" path should be provable WITHOUT a live network round trip (the second run should short-circuit on the existing file before any fetch).

## Why it matters

A third load-dependent flake (with #061 cli-dryrun and #463 voiceover-lock) that blocks pushes and forces `--no-verify`. Network-dependent tests in the default suite are inherently load-fragile.

## Scope / acceptance

- Make the idempotent-skip path assert WITHOUT a live fetch (stub/inject the fetcher, or assert the skip happens before the network call), OR move the network-touching variant to `tests/live/` (gated by `RUN_LIVE_TESTS=1`) and keep a pure offline idempotency assertion in the unit/integration suite.
- Confirm green in a full-suite run several times.

## Notes

- Related: #061 (cli-dryrun catalog-fetch flake), #463 (voiceover-lock flake). Consider a single "de-flake the pre-push suite" follow-up that addresses all three network/race-fragile tests.
