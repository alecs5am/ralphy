# Author the Silent Hill rubric instance (first instance + test target)

> **Status:** issue
> **Filed:** 2026-06-18
> **Folder:** issues
> **Severity:** medium
> **Category:** eval / content

## Context

The generic framework (#468–#470) needs a concrete instance to validate against. Silent Hill is the named test target: 002 = quality benchmark, 001 = reach (most views), 003 = the in-progress dating-sim pivot.

## What

Author the Silent Hill universe rubric as three files in the `silent-hill` workspace: a prose `STYLE_LOCK.md`, a machine-readable `evaluators.json` (the 6-criterion thresholds), and a `metrics-benchmarks.json` (recorded Instagram metrics the insta-fit criterion scores against).

## Why it matters

Without a real instance the framework is untested. This is how we prove `ralphy workspace eval` reproduces the known episode scores and that the generic/instance boundary holds.

## Scope / acceptance

- `silent-hill/STYLE_LOCK.md` — visual register (PS1-volumetric Chilla's-Art look), pacing, hook mechanics, caption/audio style, do-not-do list, benchmark references — distilled from choose-silenthill-002 + both episode postmortems.
- `silent-hill/evaluators.json` — thresholds: consequence-narration ≥90%; ≥4 distinct audio tracks; hook <3s; first-beat <5s; avg-watch >30% of duration; PS1 character-spec; prev-ref location continuity (numbers from the 3-episode comparison).
- `silent-hill/metrics-benchmarks.json` — 002 (3,615 views / 31.8% skip / 34s avg watch / 2.9% like / 2.4% save), 001 (~1,300 likes / ~30.3% skip), 003 (recorded as available).
- Acceptance: `ralphy workspace eval choose-silenthill-002` passes the benchmark; `…-003` flags the long hook + missing captions + low density.

## Dependencies and linked work

- Migration #467, framework #468, runner #469, criteria #470.

## Notes

- English-only on disk (translate any Russian source). This is content/config, not engine code.
