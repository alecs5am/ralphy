# Studio test suite is not gated by hooks or CI

> **Status:** todo
> **Filed:** 2026-06-25
> **Folder:** issues
> **Severity:** medium
> **Category:** ci / studio / test-coverage

## Context

Surfaced while implementing #488–#491 (the Studio agent-context layer). The
husky hooks and the CI workflow both run `bun test tests/unit/ tests/integration/`
only — `studio/test/server.test.ts` is never executed in the gate. The full
`bun test` (no path) DOES include it, but nothing in the gate runs that form.

## What

Studio now has a substantial server contract (artifact listing, board, runs,
annotations #488, agent inbox #489, run graph #490, config patches #491) covered
by `studio/test/server.test.ts` — but a regression there is invisible to
pre-commit, pre-push, and CI. The suite only stays green because it is run by
hand.

## Why it matters

The Studio server is the write surface for all the new sidecar metadata
(annotations / inbox / canvas layout / config patches). An accidental break in
a route or a fold function would not turn the badge red. As Studio grows this
gap widens.

## Scope / acceptance

- Add `studio/test/` to the gated test invocation. Either extend the pre-push
  hook + `.github/workflows/test.yml` step to `bun test … tests/unit/ tests/integration/ studio/test/`,
  or add a dedicated `test:studio` script + CI step.
- Confirm the husky `pre-commit` / `pre-push` hooks are marked executable (they
  are currently ignored with "hook was ignored because it's not set as
  executable" — a separate but related gap worth fixing in the same change).
- Keep the load-dependent flaky integration timeout (#061) out of the studio
  lane so the studio gate stays deterministic.

## Notes

- Discovered during the #488–#491 dev-loop run.
- Studio tests are fast (~150ms) and fixture-backed (no network) — cheap to gate.
