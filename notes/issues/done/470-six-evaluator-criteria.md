# Implement the 6 pluggable evaluator criteria (generic check types)

> **Status:** done — 2026-06-18
> **Filed:** 2026-06-18
> **Folder:** issues
> **Severity:** high
> **Category:** eval / criteria

## Context

The framework (#468) and runner (#469) need the actual checks. The user enumerated six criteria for the Silent Hill universe. Implement them as GENERIC check types any workspace can configure; the Silent Hill thresholds live in config (#471), never hardcoded.

## What

Implement the deterministic + vision check types behind: (1) scenario fidelity, (2) material density, (3) edit correctness, (4) character-design cohesion, (5) location consistency, (6) insta-metric fit. Each is registered by id and referenced from a workspace rubric.

## Why it matters

These encode the 002-benchmark craft rules so assembly clears the bar before the user sees it — the substance of the quality gate.

## Scope / acceptance

Deterministic checks (computed in code):
- `material-density` — parse `index.html`: distinct audio track count, SFX count, caption bands, editing-technique coverage (countdown / freeze-or-boomerang / death-screen / flashes / selector / title-card).
- `edit-correctness` — fork holds both choices (idle-hold), death beats are single-frame i2v, SFX within ±0.15s of the visual beat, VO no-overlap, baked freeze/boomerang gates the countdown (read the beat-timeline + composition).
- `insta-metric-fit` — time-to-first-choice (<3s), first-beat length (<5s without a cut), avg-watch ÷ duration (>30%) against recorded metrics (#471).

Vision checks (deep-vision rubric fragments via #469):
- `scenario-fidelity` — consequence-narration coverage (≥90%), 50/50 choices, binary-funnel structure, target duration.
- `character-design-cohesion` — on-spec PS1 low-poly (not cinematic/voxel) + identity stable across scenes.
- `location-consistency` — prev-scene-ref continuity, no hallucination drift, persistent world-state.

- Each emits normalized `Finding[]` with severity computed against the configured threshold.
- Tests: fixtures reproducing the known 001/002/003 scores (002 passes the benchmark; 003 flags long hook + missing captions + low density).

## Dependencies and linked work

- Framework #468, runner #469.
- Blocks #471, #473.

## Notes

- Thresholds are CONFIG (from the workspace rubric), never hardcoded. Source rules: choose-silenthill-001/002 postmortems + the 3-episode density/hook comparison.
