# Flaky test: voiceover per-slot lock writeOrder

> **Status:** done — 2026-06-23
> **Filed:** 2026-06-16
> **Folder:** issues

## Context

Surfaced repeatedly during the #430–#451 `/dev-loop` run: the pre-push hook (full `bun test`) intermittently fails on `tests/unit/elevenlabs-voiceover-lock-verify.test.ts` → `generateVoiceover — per-slot file lock (#039) > two parallel calls targeting the same slot serialize and both succeed`. It fails ~40% of the time **even in isolation** (`writeOrder` comes back `["second call", "first call"]` instead of `["first call", "second call"]`).

## What

The test asserts the two parallel lock acquirers complete in strict submission order (`writeOrder == ["first call", "second call"]`). The per-slot lock guarantees mutual exclusion (`maxActive == 1`) but does NOT guarantee FIFO acquisition order, so under scheduler jitter the two promises race and the order flips. The mutual-exclusion invariant (`maxActive == 1`) is the real contract; the strict order assertion is over-specified.

## Why it matters

It's a sibling of the #061 `cli-dryrun` flake: it blocks pushes and forces `--no-verify`, eroding the pre-push gate's signal. Each false failure costs a verify-in-isolation round trip.

## Scope / acceptance

- Either make the lock genuinely FIFO (queue acquisition in submission order) and keep the assertion, OR relax the assertion to the real contract: `maxActive == 1` + both calls succeed + both land at the expected dest, dropping the strict `writeOrder` ordering (or assert the SET, not the sequence).
- Confirm 20/20 green in isolation after the fix.
- Cross-reference #061 (the other load-dependent flake) in the dev-loop flaky-hook note.

## Notes

- Do NOT "fix" by widening the timeout — the failure is an order assertion, not a timeout.
