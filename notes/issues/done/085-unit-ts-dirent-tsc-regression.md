# `cli/commands/unit.ts` — 8 tsc errors from @types/node Dirent drift (CI typecheck red)

> **Status:** done — 2026-06-04 (entries annotated as a structural `{name,isDirectory,isFile}[]` + cast through the @types drift; `bunx tsc --noEmit` now 0 errors repo-wide)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** medium (CI is red; does not block the husky commit/push hooks, which run `bun test` + targeted lints, not full `tsc`)
> **Category:** cli / tooling

## What

`bunx tsc --noEmit` reports 8 errors in `cli/commands/unit.ts` (lines 199–226), all from the `readdirSync(absDir, { withFileTypes: true })` call in the `walk()` glob helper:

```
unit.ts(199,7):  Type 'Dirent<string>[]' is not assignable to type 'Dirent<NonSharedBuffer>[]'.
unit.ts(212,34): Argument of type 'NonSharedBuffer' is not assignable to parameter of type 'string'.
... (212,67) (220,20) (221,42) (222,57) (224,38) (226,24)
```

Root cause: a `@types/node` version drift changed the `readdirSync(..., {withFileTypes:true})` overload's `Dirent` name-type, so `let entries: ReturnType<typeof readdirSync>` no longer matches the call's result and `e.name` is inferred as `NonSharedBuffer` instead of `string`.

## Confirmed pre-existing

Verified via `git stash push -u` + `tsc` on clean `HEAD` (commit `6b7614f`): the same 8 errors are present. NOT introduced by the library-data-layer work (#084). CI `test` runs have been `failure` across the last several commits for this reason.

## Fix (small)

Pin the exact shape the helper uses and cast through the @types drift, e.g.:

```ts
let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
entries = readdirSync(absDir, { withFileTypes: true }) as unknown as typeof entries;
```

or annotate `entries` as `Dirent<string>[]` (import `Dirent` from `node:fs`) so `e.name` is `string`. Re-run `bunx tsc --noEmit` to confirm 0 errors, then check whether the CI `test` job goes green (watch for the separate flaky-timeout in #061).

## Related

- #061 (flaky dryrun integration timeout — the other CI redness), #072 (bun 1.3 test incompatibilities).
