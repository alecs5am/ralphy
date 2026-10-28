# Compatibility project verbs must find store-only projects

> **Status:** done — 2026-10-28 (compatibility project, ref and assets verbs find store-only Projects by id or slug; registry is a read-only fallback on roots without a store scope)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** bug / domain store

## Context

Found in #573: `project log-asset`, `log-prompt`, `timeline` and the other compatibility verbs still look projects up in `registry.json`. Domain state is authoritative in SQLite (CLAUDE.md, AGENTS.md), so a project that exists only in the store (for example `deeep-guardian-rescues-002` in the owner's data) now resolves its scope cleanly and then fails with `E_NOT_FOUND`.

## What

Route every compatibility project verb through the store-backed project lookup (by id or slug, via the #573 resolver), keeping the registry only as a read-only fallback for unmigrated legacy roots if one still exists.

## Scope / acceptance

- Each verb that reads `registry.json` today is listed in the PR and switched; `rg registry.json cli/commands` shows no remaining project lookups outside migration code.
- Integration test: a store-only project works with log-asset, log-prompt and timeline.
- `bun run lint:no-legacy-state`, `lint:store-boundary` and affected tests pass.

## Verbs switched

Every verb below now finds its Project through `requireCompatibilityProject` /
`findCompatibilityProject` (`cli/lib/project-lookup.ts`): the store, by id or
slug inside the resolved scope, using the #573 `findProjectRefs` resolver. The
on-disk tree comes from the store record: the store Workspace's `projects/`
directory, named by the reference as given (slug or id) when that tree exists,
else by the other name when that tree exists, else by the reference as given.

- `cli/commands/project.ts`: `repair-plan`, `council`, `plan`, `style-lock`,
  `log`, `timeline`, `log-prompt`, `log-asset`, `score`, `image-pack`,
  `scorecard`, `grade-plan`, `approve`, `budget`, `transcribe`, `assets`,
  `thumbnail`, `audio-stats`, `contact-sheet`, `zip`.
- `cli/commands/project.ts`, legacy writers: `clone` and `move` use the same
  lookup and refuse a store Project with `E_INPUT_INVALID` (both write a legacy
  registry entry; `move` would have moved the tree and left the store record in
  the old Workspace). Registry Projects behave as before.
- `cli/commands/ref.ts`: `attach --to` (a store Project keeps its attached refs
  in its store metadata through `updateProject`; a registry Project still
  updates its registry entry), `check`, `pack`, `lint`, `contact-sheet`,
  `pull-site --project`, `digest --project`.
- `cli/commands/assets.ts`: `unpack --project`.
- `cli/lib/paths.ts` `projectWorkspace`: a legacy registry entry that names a
  different Workspace no longer overrides the Workspace the store resolved for
  the scoped Project (it used to fail with a scope conflict).

## Where the registry remains (read-only)

- `findCompatibilityProject`: when the command resolved no store scope (the
  data root has no `ralphy.db`, i.e. an unmigrated legacy root, or its store has
  no Workspace yet) the Project is looked up in the registry exactly as before.
- `legacyFields` in the same module: descriptive fields (`brief`, `refs`, ...)
  that store metadata does not carry yet are read from a registry entry for the
  same Project in the same Workspace; store metadata wins on a shared key. This
  keeps `ref check` and `style-lock` from losing refs and briefs attached before
  migration.
- `projectWorkspace` / `projectIdFromPath` in `cli/lib/paths.ts` still read the
  registry for references that are not the scoped Project and on legacy roots.

## Not switched

- `project delete` and `project verify` do not look the Project up; they act on
  the tree the reference names. `delete` stays a legacy-root verb (the store has
  no Project delete yet); widening a destructive verb was out of scope.
- Verbs that create registry Projects: `template use`, `batch vary`,
  `example pull`, `init`. Creating store Projects from them is separate work.

## Tests

`tests/integration/compat-verbs-store-lookup.test.ts`: a store-only Project
(no registry entry) works with `log-prompt`, `log-asset` (by store id),
`timeline`, `log`, `ref attach` + `ref check`; a stale registry entry does not
move it out of its Workspace; `project move` refuses it.
