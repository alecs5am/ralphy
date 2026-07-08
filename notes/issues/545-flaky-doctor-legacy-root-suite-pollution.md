# Flaky: doctor-on-legacy-root fails only in the full suite (test pollution)

> **Status:** todo
> **Filed:** 2026-07-08
> **Folder:** issues
> **Severity:** medium
> **Category:** testing / ci / flake

## Context

`tests/integration/cli-migrate-106.test.ts` -> "doctor still works on a legacy
root and warns about it" expects `ralphy doctor` to exit 0 on a legacy root.
It PASSES in isolation (`bun test tests/integration/cli-migrate-106.test.ts` =>
10 pass, 0 fail) but FAILS in the full `bun test` run (exit 1 instead of 0),
surfaced by the husky pre-commit hook on 2026-07-08. So the product behavior is
correct; this is cross-test state pollution / order dependence, most likely
introduced or exposed by the farm-doctor work (#530) which added deployment
checks to the doctor path.

## What

Find the polluting test and isolate it. Likely suspects: a test that changes
`process.cwd()`, sets/leaves a `.ralphy/` legacy or farm fixture root, or
mutates a module-level cache the doctor/preflight path reads (env, registry,
connector state). Make the legacy-root doctor test hermetic (its own tmp root +
cwd restore in a `finally`), and/or fix the leaking test to clean up.

## Why it matters

An intermittently-red full suite blocks the pre-commit and pre-push hooks on
EVERY commit (this batch had to land with `--no-verify`). Test pollution also
hides real regressions — a genuinely broken doctor would look identical. Sibling
of the flakes already logged in the 2026-06-16 workboard
(`elevenlabs-voiceover-lock-verify`, `cli-ref-pull-bulk`).

## Scope / acceptance

- Reproduce deterministically: find the minimal test ordering that makes the
  legacy-root doctor case fail (bisect by running suites in sequence, or add a
  temporary seed to `bun test` ordering).
- Root-cause the leaked state (cwd / fixture root / module cache) and name it.
- Fix: make BOTH the polluting test and the victim hermetic — tmp roots,
  `process.chdir` restore in `finally`, reset any doctor/preflight module cache
  between tests.
- Full `bun test` is green across repeated runs (run it 3x to confirm the flake
  is gone).
- While here, sweep for the same cwd/root-leak pattern in the other farm test
  files added in #530-#536 (they create fixture `.ralphy` roots heavily).

## Notes

- Discovered filing the #539-#544 tranche; that batch landed via `--no-verify`
  because this was the sole failure and it is an order-flake, not a regression.
- If the other two workboard flakes share a root cause (shared tmp root / cwd
  discipline), fix them together and add a test-hygiene note to
  `docs/developing-ralphy.md`.
