# Farm state backup and restore (disaster recovery)

> **Status:** todo
> **Filed:** 2026-07-08
> **Folder:** issues
> **Severity:** high
> **Category:** operations / reliability / content-farm

## Context

A deployed farm accumulates irreplaceable runtime state on one volume: the
publish ledger (#531), calendar entries (#504), trust level + agreement history
(#505), selection weights (#532), dedup store (#500), analytics snapshots
(#507), quarantine (#519), run journals (#503), and quota usage (#534). The
know-how (bundle) is reproducible from the training path; this state is NOT. A
disk failure or a bad `rm` loses months of the farm's learned history and — via
the lost publish ledger — reintroduces the double-post risk #531 exists to
prevent.

## What

A backup/restore path for a workspace's durable state:
`ralphy workspace backup <ws> [--out <path>]` snapshots the state files
(NOT the heavy media artifacts — those are regenerable / separately archivable)
into a timestamped, versioned archive; `ralphy workspace restore <archive>`
rehydrates them into a workspace, validating schema versions and refusing to
clobber newer state without an explicit flag. Document a scheduled-backup
recipe (cron/`schedule` node) and an off-host destination guidance.

## Why it matters

An unattended system that cannot survive a disk loss is not production-grade.
Backup is also what makes host migration, cloning a channel to a second server,
and "roll the farm back to last Tuesday's state" possible.

## Scope / acceptance

- Explicit state manifest: enumerate exactly which files are farm STATE
  (ledgers, calendar, trust, weights, dedup, analytics, quarantine, journals,
  quota) vs KNOW-HOW (bundle) vs MEDIA (artifacts) — reuse the know-how/state
  boundary table from #521, extend it with the media axis.
- `workspace backup`: versioned archive (schema versions embedded), excludes
  media by default (`--include-media` opt-in), append-only friendly (never
  mutates the live state while reading — snapshot copy).
- `workspace restore`: schema-version validation, refuse-to-clobber-newer
  guard (`--force` override, logged), post-restore integrity check (ledger
  parses, calendar resolves) via a `farm doctor` (#530) subset.
- Backup is safe to run on a LIVE farm (no torn reads — copy then archive, or
  brief per-file consistency); document the guarantee.
- Recipe: a documented `schedule`-node or cron backup + off-host push (the
  destination itself is the user's choice; provide the hook, not a hosted
  service).
- Tests: round-trip (backup -> wipe -> restore -> state intact), schema-version
  mismatch refusal, clobber-newer guard, media-exclusion default, live-farm
  snapshot consistency.

## Notes

- Sequence after #531/#504/#505/#532/#507 (the things it protects) exist —
  they do; this is additive.
- Losing the publish ledger is the highest-stakes case — call it out and test
  that a restore reestablishes exactly-once (#531).
