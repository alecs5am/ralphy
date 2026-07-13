# Memory hygiene sweep: backfill empty Why/How/Does-NOT-apply across all tiers

> **Status:** todo
> **Filed:** 2026-07-13
> **Folder:** issues
> **Severity:** medium
> **Category:** memory / maintenance

## Context

#045 (done) added the `**Does NOT apply to:**` negative-scope discipline and
retrofitted a handful of entries, and #116 (done) shipped `ralphy memory curate`.
But the `/dev-issues` full-tier survey (2026-07-13) found the backfill never
completed: the large majority of workspace-tier entries still carry the literal
placeholder `(not captured at note time — fill in on next review)` for
**Why / How to apply / Does NOT apply**. An entry without negative scope is the
exact over-application failure mode #045 exists to prevent, and these entries
cannot be trusted for promotion to global.

## What

Run a curate-driven backfill across every non-empty tier and approve the
proposals:

- Global tier + the 7 non-empty workspaces (`trafalgar`, `free-air-vpn`,
  `short-guides`, `bitacora`, `choose-path`, `silent-hill`, `sotaocr` if any).
- For each: `ralphy memory curate --workspace <ws>` (and global), review the
  staged `proposed/` backfills + overlap-merges, `ralphy memory approve` the
  good ones. Do NOT hand-fill 40 files — curate is the tool.
- Relocate the one cross-workspace mis-file surfaced by the survey:
  `silent-hill/efir-canon-minimal-grey-vs-blue` is an Efir (free-air-vpn)
  universe fact — re-note it into `free-air-vpn` and retire the silent-hill
  copy.

## Why it matters

Memory entries are load-bearing and injected into the intake digest. Silent
placeholders read as "no scope" and over-fire. This is also the prerequisite
that makes future workspace→global promotions safe (each candidate arrives with
real negative scope).

## Scope / acceptance

- Zero active memory entries (any tier) contain the string
  `not captured at note time` after the sweep
  (`rg -H 'not captured at note time' .ralphy/**/memory/*.md` returns nothing
   for active entries).
- Overlap-merges from curate reviewed; obvious duplicates collapsed.
- `efir-canon-minimal-grey-vs-blue` lives under `free-air-vpn`, not silent-hill.

## Notes

- Related: done #045, done #116, `notes/research/memory-coverage-matrix.md`.
- This is memory-content maintenance, not code — good `/dev-loop` fodder but
  needs judgment on each curate proposal; do not auto-approve blind.
