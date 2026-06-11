# `ralphy migrate` skips loose FILES directly under `workspace/projects/`

> **Status:** issue
> **Filed:** 2026-06-11
> **Folder:** issues

## Context

Found while running the real #106 migration (2026-06-11). The verb iterates
`workspace/projects/*` expecting project DIRECTORIES; two loose files living
directly under `projects/` (`analog-horror-social-captions.md`,
`choose-silenthill-001.zip`) were neither moved nor reported, leaving a
non-empty `workspace/` behind and breaking the `already_migrated` idempotence
check until they were relocated by hand.

## What

In `cli/lib/migrate.ts`, the per-project loop should route non-directory
entries under `workspace/projects/` to
`.ralphy/workspaces/default/projects/<basename>` (paths-follow-files) and list
them in the report (e.g. under `unclassified`), instead of silently skipping.
Same treatment for `.DS_Store`-class cruft: skip it explicitly so an otherwise
empty tree still collapses.

## Why it matters

This machine is migrated, but the verb is the public migration path for every
other legacy root. Leftover loose files mean `workspace/` never fully empties,
the idempotence detector keeps reporting moves, and users conclude the
migration "didn't finish".

## Scope / acceptance

- Loose files under `workspace/projects/` move to the default workspace's
  `projects/` dir and appear in the report.
- `.DS_Store` entries are ignored (and pruned with their parent dir when it
  empties).
- Fixture test: a legacy root with one loose file + one `.DS_Store` under
  `projects/` migrates to `{already_migrated: true}` on the second run.
