# Flaky cli-dryrun integration timeout blocks pre-commit/pre-push hooks

> **Status:** todo
> **Filed:** 2026-05-30
> **Folder:** issues
> **Severity:** medium (dev-loop friction)
> **Category:** tests / ci

## Context

Both the husky pre-commit and pre-push hooks run the full `bun test` suite
(~1116 tests). Under full-suite parallel load, `tests/integration/
cli-dryrun-coverage.test.ts` (and a sibling `cli-dryrun.test.ts`) intermittently
time out: `generate video --dry-run --summary timed out after 15002ms (killed 1
dangling process)`. The same test passes cleanly in isolation (6/6, ~1s) and the
suite passes at ~54s when not starved. Hit 3× in a row while landing #052,
forcing `--no-verify` pushes.

## What

The dry-run integration tests spawn `bun run <CLI>` subprocesses with a 15s
per-test timeout. When dozens of subprocess-spawning tests run concurrently,
CPU/IO starvation pushes a few past 15s → nondeterministic hook failures.

## Why it matters

Every commit and push runs the suite. A load-dependent flake means routine dev
work randomly fails the gate, training everyone to reach for `--no-verify` —
which then also skips the legitimate `cli:surface:check` / `lint` gates.

## Notes

- Options: raise the per-test timeout for the dry-run spawn tests (e.g. 30-45s);
  OR cap test concurrency for the integration project (`bun test --concurrency`);
  OR mock the spawn so dry-run coverage doesn't shell out; OR move heavy
  spawn-based integration tests out of the pre-commit hook (keep them in CI only).
- Cross-ref `001-cli-pretty-mode-untested`, `015-invariants-not-tested-in-ci`.
