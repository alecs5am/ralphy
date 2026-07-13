# `ralphy memory promote` — cross-tier re-tiering verb

> **Status:** todo
> **Filed:** 2026-07-13
> **Folder:** issues
> **Severity:** low
> **Category:** cli / memory

## Context

Surfaced by the `/dev-issues` "elevate memory to global practices" pass
(2026-07-13). Moving a lesson from a workspace tier to global (the whole point
of that exercise) has no verb — it takes a manual `ralphy memory note --global`
of re-typed content followed by `ralphy memory retire <slug> --workspace <ws>`.
`ralphy memory curate` operates strictly WITHIN a tier, so cross-tier hygiene
is unautomated. This makes elevation error-prone (re-typing drops frontmatter,
loses version history, forgets the retire).

## What

Add `ralphy memory promote <slug> [--from <ws>] --to <global|workspace[:<ws>]>`:
a MOVE across tiers that preserves the entry's frontmatter, all `.vN` versions,
`filed` date, and `source`, appends a promotion note to `source`, writes the
destination index line, and retires the origin (MOVE to `archived/`, never
delete — same reversibility contract as `retire`). Slug collision at the
destination versions up (`.v2`) rather than overwriting. Also support the
demote direction (`--to workspace:<ws>`) for the mis-file case.

## Why it matters

Elevation is exactly the operation this memory system was built to support and
it's the one operation that has no primitive. Without it, the tier boundary in
invariant #18 is aspirational — nobody re-tiers by hand at scale. A one-command
promote makes periodic "what should be global" passes cheap and lossless.

## Scope / acceptance

- New `promote` subcommand in the memory command group (`cli/commands/` /
  wherever `note|retire|curate` live), JSON output by default.
- Preserves frontmatter + all versions + dates; appends promotion provenance;
  rewrites BOTH tier indexes (`MEMORY.md`); origin moved to `archived/`.
- Collision → version up, never overwrite (matches append-only invariant).
- Smoke: `bun run cli/index.ts memory promote <slug> --from <ws> --to global`
  then assert the file + index line at global and the archived origin.
- README/help + `docs/cli-surface` regenerated.

## Notes

- Related: done #116 (curate, within-tier only), invariant #18 tier rule.
- Low priority — the manual re-note+retire path works; this is ergonomics.
- The 2026-07-13 consolidation (`seedance-safety-privacy-filter-guide`,
  `ps1-crude-real-person-i2v`) was done the manual way; this verb would have
  made it two commands.
